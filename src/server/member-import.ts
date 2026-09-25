import "server-only";
import { AUDIT_ACTIONS, CAPABILITIES } from "@/lib/constants";
import { IMPORT_LIMITS } from "@/lib/member-import";
import { memberCreateSchema } from "@/lib/validation";
import { normalizeName, normalizePhone } from "@/lib/utils";
import { canAccess, type TenantContext } from "@/server/auth";
import { withTenant, type TenantDb } from "@/server/db";
import { DomainError } from "@/server/errors";
import type { ImportRowIssue } from "@/lib/member-import";

/**
 * One row as it arrives from the browser, carrying the line it came from.
 *
 * The line number travels with the row rather than being reconstructed from the
 * array index, because the browser submits only the rows it believes are
 * importable. Without it, every skip would be reported against a position in the
 * submission rather than against a row of the file the priest is holding, and
 * "line 4" would be a number they cannot act on.
 */
export interface ImportRowPayload {
  name: string;
  phone: string | null;
  rowNumber: number;
}

/** A refused row, reported so the file can be fixed rather than guessed at. */
export interface ImportSkip {
  rowNumber: number;
  name: string;
  issue: ImportRowIssue;
}

export interface ImportOutcome {
  imported: number;
  /** Refused by field validation or by the same duplicate rule the add form applies. */
  skipped: ImportSkip[];
  /** Of `skipped`, how many matched a member this tenant already holds. */
  duplicates: number;
}

const MAX_BATCH = IMPORT_LIMITS.maxRows;

/**
 * The key the composite unique index is built on: (tenantId, nameNormalized,
 * phoneNormalized).
 *
 * Returns null when there is no phone, and that null is meaningful rather than
 * a shrug: PostgreSQL treats NULLs as distinct in a unique index, so a member
 * with no phone number cannot collide with another. The add-member path already
 * relies on this, and the import deliberately does not be stricter, because a
 * stricter import would refuse people the add form happily accepts.
 */
function duplicateKey(name: string, phone: string | null): string | null {
  if (!phone) return null;
  return `${normalizeName(name)} ${normalizePhone(phone)}`;
}

/**
 * The keys of every existing member in this tenant that could collide.
 *
 * Read in full rather than probed per row: one query returning a few thousand
 * short strings beats two thousand round trips, and the roster is bounded by
 * the same limits the dashboard itself works within.
 */
async function existingDuplicateKeys(
  db: TenantDb,
  tenantId: string,
): Promise<Set<string>> {
  const rows = await db.member.findMany({
    where: { tenantId, phoneNormalized: { not: null } },
    select: { nameNormalized: true, phoneNormalized: true },
  });

  const keys = new Set<string>();
  for (const row of rows) {
    if (row.phoneNormalized === null) continue;
    keys.add(`${row.nameNormalized} ${row.phoneNormalized}`);
  }
  return keys;
}

/**
 * Imports a roster into the caller's own tenant.
 *
 * The batch is validated completely before a single row is written, and the
 * writes then go in one statement inside one transaction. That is a deliberate
 * trade: an import that stops halfway through a parish's roster is far worse
 * than one that refuses, because the priest cannot tell which half landed and
 * the audit trail would record only the attempt. A roster is a few hundred
 * rows, so the cost is a slightly longer transaction in exchange for never
 * leaving a congregation half-entered.
 *
 * There is no tenant parameter anywhere in this signature. The tenant is the
 * caller's own membership, the queries run inside that tenant's RLS context, and
 * `tenantId` is written on every row here rather than read from the batch — a
 * request naming another priest's workspace has nowhere to put the name.
 */
export async function importMembers(
  context: TenantContext,
  rows: ImportRowPayload[],
): Promise<ImportOutcome> {
  if (!canAccess(context, CAPABILITIES.MANAGE_MEMBERS)) {
    throw new DomainError("CANNOT_ADD");
  }
  assertImportSize(rows.length);

  const tenantId = context.tenant.id;
  const userId = context.user.id;

  return withTenant(tenantId, async (db) => {
    // Re-validate every field, here, with the add-member schema. The browser ran
    // the same check to draw the preview, but a preview is a suggestion: nothing
    // reaching this function is trusted because it appeared in one.
    const accepted: ImportRowPayload[] = [];
    const skipped: ImportSkip[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      const rowNumber = Number.isInteger(row?.rowNumber) ? row.rowNumber : 0;
      const name = typeof row?.name === "string" ? row.name.replace(/\s+/g, " ") : "";
      const phone =
        typeof row?.phone === "string" && row.phone.trim() !== "" ? row.phone.trim() : null;

      const parsed = memberCreateSchema.safeParse({ name, phone: phone ?? undefined });
      if (!parsed.success) {
        skipped.push({
          rowNumber,
          name,
          issue: parsed.error.issues[0]?.path[0] === "phone" ? "phoneInvalid" : "nameRequired",
        });
        continue;
      }

      const candidate: ImportRowPayload = {
        name: parsed.data.name,
        phone: parsed.data.phone ?? null,
        rowNumber,
      };

      const key = duplicateKey(candidate.name, candidate.phone);
      if (key !== null && seen.has(key)) {
        skipped.push({ rowNumber, name: candidate.name, issue: "duplicateInFile" });
        continue;
      }
      if (key !== null) seen.add(key);

      accepted.push(candidate);
    }

    const existing = await existingDuplicateKeys(db, tenantId);
    const toCreate: ImportRowPayload[] = [];
    let duplicates = 0;

    for (const candidate of accepted) {
      const key = duplicateKey(candidate.name, candidate.phone);
      if (key !== null && existing.has(key)) {
        duplicates += 1;
        skipped.push({
          rowNumber: candidate.rowNumber,
          name: candidate.name,
          issue: "duplicateInFile",
        });
        continue;
      }
      toCreate.push(candidate);
    }

    if (toCreate.length > 0) {
      await db.member.createMany({
        data: toCreate.map((candidate) => ({
          tenantId,
          name: candidate.name,
          nameNormalized: normalizeName(candidate.name),
          phone: candidate.phone,
          phoneNormalized: candidate.phone ? normalizePhone(candidate.phone) : null,
          lastConfessionDate: null,
          // Null so the tenant's own default interval applies, exactly as it
          // would if the same person had been added by hand. The import has no
          // second notion of a default.
          confessionIntervalDays: null,
          administrativeNote: null,
        })),
      });

      // One audit event for the batch, not one per person. The action was taken
      // by one person at one moment; two thousand identical entries would bury
      // the events around them.
      await db.auditLog.create({
        data: {
          tenantId,
          action: AUDIT_ACTIONS.MEMBERS_IMPORTED,
          userId,
          memberId: null,
        },
      });
    }

    skipped.sort((left, right) => left.rowNumber - right.rowNumber);

    return { imported: toCreate.length, skipped, duplicates };
  });
}

/**
 * Refuses an oversized batch.
 *
 * Called before parsing in the action layer so a huge payload never reaches the
 * database, and again inside the service, because a service that trusts its
 * caller about a size limit is not a limit.
 */
export function assertImportSize(count: number): void {
  if (count > MAX_BATCH) {
    throw new DomainError("IMPORT_TOO_LARGE", { max: MAX_BATCH });
  }
}
