import "server-only";
import { AUDIT_ACTIONS, CAPABILITIES } from "@/lib/constants";
import { isValidIsoDate } from "@/lib/dates";
import type { MemberCreateInput, MemberUpdateInput } from "@/lib/validation";
import { normalizeName, normalizePhone } from "@/lib/utils";
import { DomainError } from "@/server/errors";
import { canAccess, type TenantContext } from "@/server/auth";
import { verifyPassword } from "@/server/password";
import { withTenant, type TenantDb } from "@/server/db";
import type { ErrorCode } from "@/lib/error-codes";

function validateConfessionDate(date: string, today: string): void {
  if (!isValidIsoDate(date)) {
    throw new DomainError("INVALID_DATE");
  }
  if (date > today) {
    throw new DomainError("FUTURE_DATE");
  }
}

/**
 * Authorization is expressed as a capability check against the caller's
 * membership role and throws rather than redirecting, because these functions
 * are reached from server actions that need to surface a message to the user.
 *
 * The third argument is an `ErrorCode` rather than a sentence, because the
 * refusal differs per operation: a priest who cannot record is in a different
 * position from a priest who cannot erase, and only the action layer knows the
 * language to explain either in.
 */
function assertCapability(
  context: TenantContext,
  capability: (typeof CAPABILITIES)[keyof typeof CAPABILITIES],
  code: ErrorCode,
): void {
  if (!canAccess(context, capability)) {
    throw new DomainError(code);
  }
}

type MemberTransaction = Pick<TenantDb, "member">;

function duplicateMemberError(archived: boolean): DomainError {
  return new DomainError(archived ? "ARCHIVED_DUPLICATE" : "DUPLICATE_MEMBER");
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * Duplicate detection is scoped to the tenant as well as the member.
 *
 * Uniqueness is a per-tenant rule, enforced by the composite constraint
 * (tenantId, nameNormalized, phoneNormalized). Two different tenants may hold
 * the same person, so this must not be treated as a global collision.
 */
async function assertNoDuplicate(
  db: MemberTransaction,
  tenantId: string,
  nameNormalized: string,
  phoneNormalized: string | null,
  excludeMemberId?: string,
): Promise<void> {
  if (!phoneNormalized) return;

  const duplicate = await db.member.findFirst({
    where: {
      tenantId,
      nameNormalized,
      phoneNormalized,
      ...(excludeMemberId ? { id: { not: excludeMemberId } } : {}),
    },
    select: { archivedAt: true },
  });

  if (duplicate) {
    throw duplicateMemberError(Boolean(duplicate.archivedAt));
  }
}

export async function createMember(
  context: TenantContext,
  input: MemberCreateInput,
  today: string,
): Promise<string> {
  assertCapability(context, CAPABILITIES.MANAGE_MEMBERS, "CANNOT_ADD");

  if (input.lastConfessionDate) {
    validateConfessionDate(input.lastConfessionDate, today);
  }

  const tenantId = context.tenant.id;
  const nameNormalized = normalizeName(input.name);
  const phoneNormalized = input.phone ? normalizePhone(input.phone) : null;

  try {
    return await withTenant(tenantId, async (db) => {
      await assertNoDuplicate(db, tenantId, nameNormalized, phoneNormalized);

      const member = await db.member.create({
        data: {
          tenantId,
          name: input.name,
          nameNormalized,
          phone: input.phone ?? null,
          phoneNormalized,
          lastConfessionDate: input.lastConfessionDate ?? null,
          confessionIntervalDays: input.customIntervalDays ?? null,
          administrativeNote: input.administrativeNote ?? null,
        },
      });

      if (input.lastConfessionDate) {
        // The composite foreign key on ConfessionRecord also requires the
        // recordedById to be a member of this tenant, so the attribution is
        // checked by the database and not merely by this call site.
        await db.confessionRecord.create({
          data: {
            tenantId,
            memberId: member.id,
            confessionDate: input.lastConfessionDate,
            recordedById: context.user.id,
          },
        });
      }

      await db.auditLog.create({
        data: {
          tenantId,
          action: AUDIT_ACTIONS.MEMBER_CREATED,
          userId: context.user.id,
          memberId: member.id,
        },
      });

      return member.id;
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw duplicateMemberError(false);
    }
    throw error;
  }
}

export async function updateMember(
  context: TenantContext,
  input: MemberUpdateInput,
): Promise<void> {
  assertCapability(context, CAPABILITIES.MANAGE_MEMBERS, "CANNOT_EDIT");

  const tenantId = context.tenant.id;
  const nameNormalized = normalizeName(input.name);
  const phoneNormalized = input.phone ? normalizePhone(input.phone) : null;

  try {
    await withTenant(tenantId, async (db) => {
      // Looked up by the composite key rather than by bare id. If the id
      // belongs to another tenant the lookup simply finds nothing, and the
      // caller is told the member does not exist without learning that it does.
      const existing = await db.member.findUnique({
        where: { tenantId_id: { tenantId, id: input.id } },
        select: { id: true, archivedAt: true },
      });

      if (!existing || existing.archivedAt) {
        throw new DomainError("MEMBER_NOT_FOUND");
      }

      await assertNoDuplicate(db, tenantId, nameNormalized, phoneNormalized, input.id);

      await db.member.update({
        where: { tenantId_id: { tenantId, id: input.id } },
        data: {
          name: input.name,
          nameNormalized,
          phone: input.phone ?? null,
          phoneNormalized,
          confessionIntervalDays: input.customIntervalDays ?? null,
          administrativeNote: input.administrativeNote ?? null,
        },
      });
      await db.auditLog.create({
        data: {
          tenantId,
          action: AUDIT_ACTIONS.MEMBER_UPDATED,
          userId: context.user.id,
          memberId: input.id,
        },
      });
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw duplicateMemberError(false);
    }
    throw error;
  }
}

export async function recordConfession(
  context: TenantContext,
  memberId: string,
  confessionDate: string,
  today: string,
): Promise<void> {
  assertCapability(context, CAPABILITIES.MANAGE_MEMBERS, "CANNOT_RECORD");
  validateConfessionDate(confessionDate, today);
  const tenantId = context.tenant.id;

  await withTenant(tenantId, async (db) => {
    const member = await db.member.findUnique({
      where: { tenantId_id: { tenantId, id: memberId } },
      select: {
        id: true,
        name: true,
        lastConfessionDate: true,
        archivedAt: true,
      },
    });

    if (!member || member.archivedAt) {
      throw new DomainError("MEMBER_NOT_FOUND");
    }

    if (confessionDate === member.lastConfessionDate) {
      throw new DomainError("DUPLICATE_DATE");
    }

    if (member.lastConfessionDate && confessionDate < member.lastConfessionDate) {
      throw new DomainError("DATE_OUT_OF_ORDER");
    }

    const existingRecord = await db.confessionRecord.findUnique({
      where: {
        tenantId_memberId_confessionDate: {
          tenantId,
          memberId,
          confessionDate,
        },
      },
      select: { id: true },
    });

    if (existingRecord) {
      throw new DomainError("DUPLICATE_DATE");
    }

    await db.confessionRecord.create({
      data: {
        tenantId,
        memberId,
        confessionDate,
        recordedById: context.user.id,
      },
    });
    await db.member.update({
      where: { tenantId_id: { tenantId, id: memberId } },
      data: { lastConfessionDate: confessionDate },
    });
    await db.auditLog.create({
      data: {
        tenantId,
        action: AUDIT_ACTIONS.CONFESSION_RECORDED,
        userId: context.user.id,
        memberId,
      },
    });
  });
}

export async function archiveMember(
  context: TenantContext,
  memberId: string,
): Promise<void> {
  assertCapability(context, CAPABILITIES.MANAGE_MEMBERS, "CANNOT_ARCHIVE");
  const tenantId = context.tenant.id;

  await withTenant(tenantId, async (db) => {
    // updateMany with a tenant predicate is what makes this safe: a member id
    // from another tenant matches no row, so the archive is a no-op that the
    // caller reports as "not found" rather than a cross-tenant write.
    const result = await db.member.updateMany({
      where: { tenantId, id: memberId, archivedAt: null },
      data: { archivedAt: new Date() },
    });

    if (result.count === 0) {
      throw new DomainError("MEMBER_NOT_FOUND");
    }

    await db.auditLog.create({
      data: {
        tenantId,
        action: AUDIT_ACTIONS.MEMBER_ARCHIVED,
        userId: context.user.id,
        memberId,
      },
    });
  });
}

export async function restoreMember(
  context: TenantContext,
  memberId: string,
): Promise<void> {
  assertCapability(context, CAPABILITIES.MANAGE_MEMBERS, "CANNOT_RESTORE");
  const tenantId = context.tenant.id;

  await withTenant(tenantId, async (db) => {
    const result = await db.member.updateMany({
      where: { tenantId, id: memberId, archivedAt: { not: null } },
      data: { archivedAt: null },
    });

    if (result.count === 0) {
      throw new DomainError("MEMBER_NOT_FOUND");
    }

    await db.auditLog.create({
      data: {
        tenantId,
        action: AUDIT_ACTIONS.MEMBER_RESTORED,
        userId: context.user.id,
        memberId,
      },
    });
  });
}

export async function permanentlyDeleteMember(
  context: TenantContext,
  memberId: string,
  currentPassword: string,
): Promise<void> {
  assertCapability(context, CAPABILITIES.DELETE_MEMBERS, "ADMIN_ONLY_DELETE");
  if (typeof currentPassword !== "string" || currentPassword.length === 0) {
    throw new DomainError("PASSWORD_REQUIRED");
  }
  if (currentPassword.length > 200) {
    throw new DomainError("INVALID_PASSWORD");
  }

  const tenantId = context.tenant.id;

  await withTenant(tenantId, async (db) => {
    const [member, actorRecord] = await Promise.all([
      db.member.findUnique({
        where: { tenantId_id: { tenantId, id: memberId } },
        select: { id: true, archivedAt: true },
      }),
      // User is a global identity table and is not under RLS; it is read here
      // only to re-verify the actor's own password for step-up confirmation.
      db.user.findUnique({
        where: { id: context.user.id },
        select: { passwordHash: true, isActive: true },
      }),
    ]);

    if (!member || !member.archivedAt) {
      throw new DomainError("ARCHIVED_MEMBER_NOT_FOUND");
    }

    if (
      !actorRecord?.isActive ||
      !(await verifyPassword(actorRecord.passwordHash, currentPassword))
    ) {
      throw new DomainError("INVALID_PASSWORD");
    }

    await db.auditLog.create({
      data: {
        tenantId,
        action: AUDIT_ACTIONS.MEMBER_PERMANENTLY_DELETED,
        userId: context.user.id,
        // The member is being erased; do not retain its identifier in the audit trail.
        memberId: null,
      },
    });
    await db.member.delete({ where: { tenantId_id: { tenantId, id: memberId } } });
  });
}
