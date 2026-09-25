"use server";

import { revalidatePath } from "next/cache";
import { CAPABILITIES } from "@/lib/constants";
import { IMPORT_LIMITS } from "@/lib/member-import";
import { getRequestDictionary, getRequestLocale } from "@/lib/i18n-server";
import { fill, formatNumber } from "@/lib/i18n";
import { requireCapability } from "@/server/auth";
import {
  assertImportSize,
  importMembers,
  type ImportRowPayload,
  type ImportSkip,
} from "@/server/member-import";
import { failureState, refusalState } from "@/app/actions/error-response";

/**
 * The import's result carries a structure, not just a sentence.
 *
 * Every other action in this application answers with a message because a message
 * is all the form needs to display. The import is different: a priest who asked
 * for four hundred people needs to know how many arrived, which lines did not,
 * and why — and a single string cannot carry that. So the result is a small
 * report, and the sentences inside it are translated on arrival.
 */
export interface ImportActionResult {
  ok: boolean;
  message: string;
  imported: number;
  /** Of `skipped`, how many matched a member the tenant already held. */
  duplicates: number;
  skips: ImportSkip[];
  /**
   * True when more rows were skipped than are listed. The count is always
   * accurate; the list is not, and saying so is better than silently showing the
   * first twenty of two thousand.
   */
  skipsTruncated: boolean;
}

function emptyResult(ok: boolean, message: string): ImportActionResult {
  return { ok, message, imported: 0, duplicates: 0, skips: [], skipsTruncated: false };
}

/**
 * The rows a browser submits: an array of plain objects with three string or
 * null fields and nothing else.
 *
 * The shape is declared here rather than imported from the service because this
 * is an untrusted boundary. Nothing that arrives is assumed to be a number, a
 * string, or even present, and the service re-derives everything it needs from
 * the add-member schema.
 */
const payloadRowSchema = (value: unknown): ImportRowPayload | null => {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.name !== "string") return null;
  if (candidate.phone !== null && typeof candidate.phone !== "string") return null;
  if (typeof candidate.rowNumber !== "number" || !Number.isFinite(candidate.rowNumber)) {
    return null;
  }
  return {
    name: candidate.name,
    phone: (candidate.phone as string | null) ?? null,
    rowNumber: candidate.rowNumber,
  };
};

/**
 * A refusal, shaped as an import result so the client has one thing to render.
 *
 * The shared `refusalState` helper answers with a bare `ActionState` because
 * every other action wants nothing more than a sentence. The import screen wants
 * the same sentence with an empty report attached, and doing the widening here
 * means the error text is still produced in exactly one place.
 */
async function refuse(
  code: Parameters<typeof refusalState>[0],
  params: Record<string, string | number> = {},
): Promise<ImportActionResult> {
  const failure = await refusalState(code, params);
  return emptyResult(false, failure.message);
}

export async function importMembersAction(rows: unknown): Promise<ImportActionResult> {
  const context = await requireCapability(CAPABILITIES.MANAGE_MEMBERS);
  const locale = await getRequestLocale();
  const dict = await getRequestDictionary();

  if (!Array.isArray(rows)) {
    return emptyResult(false, dict.errors.importUnreadable);
  }

  // Refused before anything else touches the payload, so an oversized batch is
  // never parsed, and again inside the service, which does not trust its caller.
  if (rows.length > IMPORT_LIMITS.maxRows) {
    return refuse("IMPORT_TOO_LARGE", {
      max: formatNumber(IMPORT_LIMITS.maxRows, locale),
    });
  }

  const candidates: ImportRowPayload[] = [];
  for (const raw of rows) {
    const row = payloadRowSchema(raw);
    // A row of the wrong shape is dropped rather than guessed at, and the drop
    // is visible in the totals because the importable count no longer adds up.
    if (row) candidates.push(row);
  }

  if (candidates.length === 0) {
    return refuse("IMPORT_EMPTY");
  }

  try {
    assertImportSize(candidates.length);
    const outcome = await importMembers(context, candidates);

    revalidatePath("/");
    revalidatePath("/members");
    revalidatePath("/settings/archived");
    revalidatePath("/settings");

    const visible = outcome.skipped.slice(0, IMPORT_LIMITS.maxReportedSkips);
    const imported = formatNumber(outcome.imported, locale);

    const message =
      outcome.imported === 0
        ? dict.import.nothingImported
        : fill(
            outcome.imported === 1 ? dict.import.importedOne : dict.import.importedMany,
            { count: imported },
          );

    // The skip reasons are translated here, on the server, so the report is in
    // one language throughout rather than being assembled from codes the client
    // has to remember to render.
    return {
      ok: true,
      message,
      imported: outcome.imported,
      duplicates: outcome.duplicates,
      skips: visible.map((skip) => ({
        rowNumber: skip.rowNumber,
        name: skip.name,
        issue: skip.issue,
      })),
      skipsTruncated: outcome.skipped.length > visible.length,
    };
  } catch (error) {
    const failure = await failureState(error, "importUnreadable");
    return emptyResult(false, failure.message);
  }
}
