import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { USER_ROLES, isUserRole, type UserRole } from "@/lib/constants";
import {
  generateCode,
  hashCode,
  isWellFormedCode,
  normalizeCode,
} from "@/lib/invite-code";
import { prisma } from "@/server/db";
import { DomainError } from "@/server/errors";
import type { TenantContext } from "@/server/auth";

/**
 * The server side of invitation handling.
 *
 * Code generation, normalization and digesting live in `@/lib/invite-code` so
 * that the operator CLI and this module cannot drift apart; see the note there.
 */

const DEFAULT_VALIDITY_DAYS = 14;

export { normalizeCode };

export function generateTenantSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  // A slug must be non-empty even for a name written entirely in a
  // non-Latin script, so fall back to a random suffix rather than colliding
  // on an empty value.
  return `${base || "tenant"}-${randomBytes(3).toString("hex")}`;
}

export interface CreatedInvite {
  code: string;
  expiresAt: Date;
}

/**
 * Mints an invitation to join *this* tenant.
 *
 * This function deliberately cannot create a new tenant. New-tenant codes are a
 * platform-operator action and live in `scripts/create-invite.ts`; if an
 * in-app request could mint one, then every tenant administrator on the
 * platform would be able to provision unlimited new workspaces, which is a
 * platform capability dressed up as a tenant one. Restricting the function to
 * the caller's own tenant makes that impossible to reach by accident.
 *
 * Only a tenant administrator may widen access, and only within their own
 * tenant. A priest managing their own congregation cannot invite anyone.
 *
 * The plaintext code is returned exactly once and is never persisted; only its
 * SHA-256 digest is stored. There is no way to recover it afterwards, which is
 * the point: a stolen database backup yields no usable invitations.
 */
export async function createInvite(
  context: TenantContext,
  options: {
    role?: UserRole;
    email?: string | null;
    maxUses?: number;
    validityDays?: number;
  } = {},
): Promise<CreatedInvite> {
  if (context.membership.role !== USER_ROLES.TENANT_ADMIN) {
    // Distinct from the generic ADMIN_ONLY so the message can say *what* is
    // impossible. "Only a tenant administrator can invite other people" tells a
    // priest they must ask the operator, which is actionable; a generic
    // refusal leaves them guessing.
    throw new DomainError("ADMIN_ONLY_INVITE");
  }

  const role = options.role ?? USER_ROLES.PRIEST;
  if (!isUserRole(role)) {
    throw new DomainError("INVALID_ROLE");
  }

  const code = generateCode();
  const expiresAt = new Date(
    Date.now() + (options.validityDays ?? DEFAULT_VALIDITY_DAYS) * 24 * 60 * 60 * 1_000,
  );

  await prisma.inviteCode.create({
    data: {
      codeHash: hashCode(code),
      role,
      // Fixed to the caller's own tenant, not taken from the caller. There is
      // no parameter through which a different tenant id could arrive.
      tenantId: context.tenant.id,
      tenantName: null,
      email: options.email?.toLowerCase() ?? null,
      maxUses: options.maxUses ?? 1,
      expiresAt,
      createdById: context.user.id,
    },
  });

  return { code, expiresAt };
}

export interface ValidatedInvite {
  role: UserRole;
  tenantId: string | null;
  tenantName: string | null;
  /** An optional address the code was minted for, if one was recorded. */
  email: string | null;
}

/**
 * Checks a code without consuming it, so the sign-up form can show an early
 * message. This is a convenience for the user, not a security control: the
 * authoritative check happens in `redeemInvite`.
 */
export async function validateInvite(code: string): Promise<ValidatedInvite | null> {
  if (!isWellFormedCode(code)) return null;

  const invite = await prisma.inviteCode.findUnique({
    where: { codeHash: hashCode(code) },
  });

  if (!invite || invite.revokedAt || invite.expiresAt <= new Date()) return null;
  if (invite.usedCount >= invite.maxUses) return null;
  if (!isUserRole(invite.role)) return null;

  return {
    role: invite.role,
    tenantId: invite.tenantId,
    tenantName: invite.tenantName,
    email: invite.email,
  };
}

/**
 * Consumes an invitation, atomically.
 *
 * The row is locked with SELECT ... FOR UPDATE for the duration of the
 * transaction. Without that lock two simultaneous sign-ups presenting the same
 * single-use code could both observe `usedCount` below the limit and both
 * succeed. The lock makes the check, the caller's work and the increment one
 * indivisible step.
 *
 * The handler receives the transaction client, so everything it writes joins
 * the same transaction. That is what makes sign-up safe end to end: if the
 * tenant or the user fails to be created, the increment is rolled back and the
 * code is still unused, so a genuine second attempt is not locked out by the
 * first one crashing halfway.
 */
export async function redeemInvite<T>(
  code: string,
  handler: (invite: ValidatedInvite, db: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (!isWellFormedCode(code)) {
    throw new DomainError("INVALID_INVITE");
  }

  const codeHash = hashCode(code);

  return prisma.$transaction(
    async (db) => {
      const rows = await db.$queryRaw<
        Array<{
          id: string;
          role: string;
          tenantId: string | null;
          tenantName: string | null;
          email: string | null;
          usedCount: number;
          maxUses: number;
          expiresAt: Date;
          revokedAt: Date | null;
        }>
      >`SELECT id, role, "tenantId", "tenantName", email, "usedCount", "maxUses", "expiresAt", "revokedAt"
        FROM "InviteCode" WHERE "codeHash" = ${codeHash} FOR UPDATE`;

      const invite = rows[0];
      if (!invite) {
        throw new DomainError("INVALID_INVITE");
      }
      if (invite.revokedAt) {
        throw new DomainError("INVALID_INVITE");
      }
      if (invite.expiresAt.getTime() <= Date.now()) {
        throw new DomainError("INVITE_EXPIRED");
      }
      if (invite.usedCount >= invite.maxUses) {
        throw new DomainError("INVITE_USED");
      }
      if (!isUserRole(invite.role)) {
        throw new DomainError("INVALID_INVITE");
      }

      const result = await handler(
        {
          role: invite.role,
          tenantId: invite.tenantId,
          tenantName: invite.tenantName,
          email: invite.email,
        },
        db,
      );

      await db.inviteCode.update({
        where: { id: invite.id },
        data: { usedCount: { increment: 1 } },
      });

      return result;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}

export async function listInvites(context: TenantContext) {
  if (context.membership.role !== USER_ROLES.TENANT_ADMIN) {
    throw new DomainError("ADMIN_ONLY");
  }

  return prisma.inviteCode.findMany({
    where: { tenantId: context.tenant.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      email: true,
      role: true,
      usedCount: true,
      maxUses: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
}

export async function revokeInvite(context: TenantContext, inviteId: string) {
  if (context.membership.role !== USER_ROLES.TENANT_ADMIN) {
    throw new DomainError("ADMIN_ONLY");
  }

  // The tenant predicate is part of the update rather than a prior check, so a
  // revoke can only ever touch an invitation this tenant issued.
  const result = await prisma.inviteCode.updateMany({
    where: { id: inviteId, tenantId: context.tenant.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (result.count === 0) {
    throw new DomainError("INVITE_NOT_FOUND");
  }
}
