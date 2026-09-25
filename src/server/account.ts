import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { ErrorCode } from "@/lib/error-codes";
import { AUDIT_ACTIONS, defaultSettings, USER_ROLES } from "@/lib/constants";
import type { Locale } from "@/lib/i18n";
import { defaultWhatsappTemplate } from "@/lib/whatsapp";
import { prisma } from "@/server/db";
import { DomainError } from "@/server/errors";
import { generateTenantSlug, redeemInvite, type ValidatedInvite } from "@/server/invites";
import { sendPasswordResetEmail } from "@/server/mailer";
import { hashPassword } from "@/server/password";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1_000;
const RESET_WINDOW_MS = 15 * 60 * 1_000;
const MAX_RESET_REQUESTS = 3;
const MAX_RESET_REQUESTS_PER_NETWORK = 20;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export interface RegistrationInput {
  inviteCode: string;
  name: string;
  email: string;
  password: string;
  /** Only consulted when the invitation provisions a new tenant. */
  tenantName?: string;
  /**
   * The language the reminder template starts in. Carried rather than read from
   * a global default because the person filling this form is the person who
   * will be editing that message, and they are the only one who can say which
   * language it should start in. It also seeds `User.locale`, so the account
   * opens in the language it was created in.
   */
  locale: Locale;
}

export interface RegistrationResult {
  userId: string;
  tenantId: string;
  tenantName: string;
}

/**
 * Creates an account and its tenant, or joins the user to an existing tenant.
 *
 * Which of the two happens is decided entirely by the invitation, never by
 * anything the person submitting the form chooses. A form field cannot ask to
 * "join tenant X": there is no tenant selector on this path, because a
 * client-chosen tenant id is precisely the thing the whole design exists to
 * prevent.
 *
 * The first member of a brand new tenant always becomes its administrator. The
 * invitation cannot grant TENANT_ADMIN to a platform-level code, so this is the
 * only way that role is ever bootstrapped and there is no path by which an
 * invitation can mint a second administrator for a new tenant.
 */
export async function registerWithInvite(
  input: RegistrationInput,
): Promise<RegistrationResult> {
  const email = input.email.toLowerCase();
  const passwordHash = await hashPassword(input.password);

  return redeemInvite(input.inviteCode, async (invite: ValidatedInvite, db: Prisma.TransactionClient) => {
    const existing = await db.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new DomainError("EMAIL_TAKEN");
    }

    const user = await db.user.create({
      data: { name: input.name, email, passwordHash },
      select: { id: true },
    });

    if (invite.tenantId) {
      // Joining an existing tenant. The membership is created inside a context
      // set to that tenant, so RLS admits the row and would reject a write
      // aimed at any other tenant.
      await db.$executeRaw`SELECT set_config('app.tenant_id', ${invite.tenantId}, true)`;
      await db.tenantMembership.create({
        data: { tenantId: invite.tenantId, userId: user.id, role: invite.role },
      });
      await db.auditLog.create({
        data: {
          tenantId: invite.tenantId,
          action: AUDIT_ACTIONS.INVITE_REDEEMED,
          userId: user.id,
        },
      });

      const tenant = await db.tenant.findUnique({
        where: { id: invite.tenantId },
        select: { name: true },
      });

      return {
        userId: user.id,
        tenantId: invite.tenantId,
        tenantName: tenant?.name ?? "",
      };
    }

    // Provisioning a new tenant.
    const tenantId = randomBytes(16).toString("hex");
    const tenantName = input.tenantName?.trim() || invite.tenantName?.trim() || input.name;
    const slug = generateTenantSlug(tenantName);

    // The context is set to the id about to be created, which is what lets the
    // Tenant INSERT satisfy its own WITH CHECK clause. See the RLS migration
    // for why this needs no privileged role.
    await db.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

    await db.tenant.create({
      data: { id: tenantId, name: tenantName, slug },
    });
    await db.tenantSettings.create({
      data: { tenantId, ...defaultSettings(defaultWhatsappTemplate(input.locale)) },
    });
    await db.tenantMembership.create({
      data: { tenantId, userId: user.id, role: USER_ROLES.TENANT_ADMIN },
    });
    await db.auditLog.create({
      data: { tenantId, action: AUDIT_ACTIONS.TENANT_CREATED, userId: user.id },
    });

    return { userId: user.id, tenantId, tenantName };
  });
}

/**
 * Issues a password reset token and emails the link.
 *
 * Always reports success. If the address is unknown, a request is still counted
 * and the same generic reply is returned, so the form cannot be used to discover
 * which addresses have accounts. A real token is never generated for an unknown
 * address either, so the two paths differ only in the work done, not the reply.
 */
export async function requestPasswordReset(
  email: string,
  clientIdentifier: string,
): Promise<void> {
  const normalized = email.toLowerCase();
  const throttles = [
    {
      key: hashToken(`reset:account:${normalized}`),
      maxFailures: MAX_RESET_REQUESTS,
    },
    {
      key: hashToken(`reset:network:${clientIdentifier}`),
      maxFailures: MAX_RESET_REQUESTS_PER_NETWORK,
    },
  ];

  if (await isThrottled(throttles)) return;

  const user = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true, email: true, isActive: true },
  });

  if (!user || !user.isActive) {
    await registerThrottleFailure(throttles);
    return;
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  // Any outstanding tokens for this account are cleared first, so a person who
  // asked twice is left with exactly one usable link and an earlier leaked
  // email cannot be used after a newer request.
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
    }),
    prisma.authThrottle.deleteMany({ where: { key: { in: throttles.map((t) => t.key) } } }),
  ]);

  const result = await sendPasswordResetEmail(user.email, token);
  if (!result.delivered) {
    // A token that was minted but could not be delivered is useless and is a
    // liability if it is ever found in a log, so it is withdrawn.
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
  }
}

type Throttle = { key: string; maxFailures: number };

async function isThrottled(throttles: Throttle[]): Promise<boolean> {
  const now = new Date();

  const rows = await prisma.authThrottle.findMany({
    where: { key: { in: throttles.map((t) => t.key) } },
    select: { key: true, blockedUntil: true },
  });
  return rows.some((row) => row.blockedUntil !== null && row.blockedUntil > now);
}

async function registerThrottleFailure(throttles: Throttle[]): Promise<void> {
  const now = new Date();

  await prisma.$transaction(async (db) => {
    for (const throttle of throttles) {
      const current = await db.authThrottle.findUnique({ where: { key: throttle.key } });
      const windowExpired =
        !current || now.getTime() - current.windowStartedAt.getTime() > RESET_WINDOW_MS;
      const failureCount = windowExpired ? 1 : current.failureCount + 1;

      await db.authThrottle.upsert({
        where: { key: throttle.key },
        update: {
          failureCount,
          windowStartedAt: windowExpired ? now : current.windowStartedAt,
          blockedUntil:
            failureCount >= throttle.maxFailures
              ? new Date(now.getTime() + 15 * 60 * 1_000)
              : null,
        },
        create: {
          key: throttle.key,
          failureCount,
          windowStartedAt: now,
          blockedUntil:
            failureCount >= throttle.maxFailures
              ? new Date(now.getTime() + 15 * 60 * 1_000)
              : null,
        },
      });
    }
  });
}

/**
 * Completes a reset: verifies the token, sets the new password, and
 * invalidates every existing session.
 *
 * The token is consumed with a conditional update that only matches while it
 * is unused and unexpired, so two concurrent submissions carrying the same
 * token cannot both succeed. Every session is dropped because the point of a
 * reset is usually that the old credentials may be compromised; leaving other
 * devices signed in would defeat that.
 */
export async function completePasswordReset(
  token: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; code: ErrorCode }> {
  const tokenHash = hashToken(token);
  const now = new Date();

  // A token that is missing, spent, expired, or lost a race is reported as one
  // code rather than four separate messages. The priest holding the link learns
  // only that it no longer works, which is also all the database can safely
  // distinguish about a value it only ever stored hashed.
  const rejected = { ok: false as const, code: "RESET_INVALID" as ErrorCode };

  try {
    return await prisma.$transaction(async (db) => {
      const rows = await db.$queryRaw<
        Array<{ id: string; userId: string; expiresAt: Date; usedAt: Date | null }>
      >`SELECT id, "userId", "expiresAt", "usedAt"
        FROM "PasswordResetToken" WHERE "tokenHash" = ${tokenHash} FOR UPDATE`;

      const record = rows[0];
      if (!record || record.usedAt || record.expiresAt <= now) {
        return rejected;
      }

      const consumed = await db.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: now },
      });
      if (consumed.count === 0) {
        return rejected;
      }

      await db.user.update({
        where: { id: record.userId },
        data: { passwordHash: await hashPassword(newPassword) },
      });
      await db.session.deleteMany({ where: { userId: record.userId } });

      return { ok: true as const };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return rejected;
    }
    throw error;
  }
}
