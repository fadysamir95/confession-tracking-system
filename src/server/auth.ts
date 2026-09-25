import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { can, isUserRole, type Capability, type UserRole } from "@/lib/constants";
import { prisma, withTenant } from "@/server/db";
import { hashPassword, verifyPassword } from "@/server/password";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1_000;
const LOGIN_WINDOW_MS = 15 * 60 * 1_000;
const MAX_LOGIN_FAILURES = 5;
const MAX_NETWORK_LOGIN_FAILURES = 30;
const LOGIN_BLOCK_MS = 15 * 60 * 1_000;

/**
 * A real Argon2id digest of an unreachable password.
 *
 * When no account matches the submitted address the login flow still performs
 * a full verification against this value. Without it, a wrong email would fail
 * in microseconds while a wrong password would take ~50ms of Argon2 work, and
 * that timing difference is a reliable way to enumerate which addresses have
 * accounts. The cost of a real hash here is paid to protect exactly the case
 * that would otherwise be cheap.
 */
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$+u4oJlohM4R7Rre0Vh/OvA$iBpBTFF7s8yvuVyqqfDSp/v2snB+ZZbWqVYDVPMMutE";

export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-confession_session"
    : "confession_session";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  locale: string;
}

/**
 * The resolved, authorized position of the current request.
 *
 * Every field here is derived from the signed-in session and the membership
 * rows that session's user owns. Nothing in this shape is ever read from a
 * route parameter, a query string, a form field or a request header, which is
 * what makes "the client asked for another tenant" structurally impossible
 * rather than merely checked for.
 */
export interface TenantContext {
  user: SessionUser;
  membership: {
    id: string;
    role: UserRole;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  sessionId: string;
}

export function canAccess(context: TenantContext, capability: Capability): boolean {
  return can(context.membership.role, capability);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function accountThrottleKey(email: string): string {
  return hashToken(`login:account:${email}`);
}

function networkThrottleKey(clientIdentifier: string): string {
  return hashToken(`login:network:${clientIdentifier}`);
}

type LoginThrottle = {
  key: string;
  maxFailures: number;
};

async function isLoginBlocked(throttles: LoginThrottle[]): Promise<boolean> {
  const now = new Date();
  const rows = await prisma.authThrottle.findMany({
    where: { key: { in: throttles.map((throttle) => throttle.key) } },
    select: { key: true, blockedUntil: true },
  });
  return rows.some((row) => row.blockedUntil !== null && row.blockedUntil > now);
}

async function registerLoginFailure(throttles: LoginThrottle[]): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (transaction) => {
    for (const throttle of throttles) {
      const current = await transaction.authThrottle.findUnique({
        where: { key: throttle.key },
      });
      const windowExpired =
        !current || now.getTime() - current.windowStartedAt.getTime() > LOGIN_WINDOW_MS;
      const failureCount = windowExpired ? 1 : current.failureCount + 1;

      await transaction.authThrottle.upsert({
        where: { key: throttle.key },
        update: {
          failureCount,
          windowStartedAt: windowExpired ? now : current.windowStartedAt,
          blockedUntil:
            failureCount >= throttle.maxFailures
              ? new Date(now.getTime() + LOGIN_BLOCK_MS)
              : null,
        },
        create: {
          key: throttle.key,
          failureCount,
          windowStartedAt: now,
          blockedUntil:
            failureCount >= throttle.maxFailures
              ? new Date(now.getTime() + LOGIN_BLOCK_MS)
              : null,
        },
      });
    }
  });
}

export interface LoginResult {
  user: SessionUser;
  tenant: { id: string; name: string; slug: string };
  role: UserRole;
}

/**
 * Resolves which tenant a user may act in, in two deliberate steps.
 *
 * The order is not incidental, and getting it wrong breaks authentication
 * outright. It reads:
 *
 *   1. The membership row, filtered by the session's own user id. The
 *      `TenantMembership` table is deliberately *not* under RLS, because
 *      "which tenants may this user enter?" is the question that has to be
 *      answered before any tenant context exists. The predicate comes from the
 *      signed-in session, never from a request parameter, so it can only ever
 *      return the caller's own rows.
 *
 *   2. The `Tenant` row, read from *inside* that tenant's context. Unlike
 *      `TenantMembership`, the `Tenant` table is under RLS. Attempting to pull
 *      it along as a relation on step 1 — `include: { tenant: true }` — looks
 *      natural and fails: with no context set the policy matches no rows, the
 *      relation resolves to null, and Prisma reports an inconsistent result.
 *      Reading it separately, once the tenant id is known and the context can
 *      be set to that same id, is both correct and self-admitting.
 *
 * The tenant context therefore comes from the membership record, which is the
 * authorization record, and never from anything the request supplied.
 *
 * One property is worth stating plainly: a membership revoked mid-request does
 * not abort the request already in flight. Revocation takes effect from the
 * next request onwards. Closing even that window would mean re-checking
 * membership inside every data transaction, and the trade is not worth it for a
 * revocation that is otherwise immediate.
 */
async function resolveTenantMembership(userId: string) {
  const membership = await prisma.tenantMembership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, tenantId: true, role: true },
  });

  if (!membership || !isUserRole(membership.role)) return null;

  // Narrow the role once, explicitly. `isUserRole` is a type guard on the
  // property, and TypeScript does not carry that narrowing through the
  // surrounding object, so binding it to a typed local is what keeps the
  // authorization type from degrading back to `string` downstream.
  const role: UserRole = membership.role;

  const tenant = await withTenant(membership.tenantId, (db) =>
    db.tenant.findUnique({
      where: { id: membership.tenantId },
      select: { id: true, name: true, slug: true, suspendedAt: true },
    }),
  );

  if (!tenant || tenant.suspendedAt) return null;

  return { membership: { id: membership.id, tenantId: membership.tenantId, role }, tenant };
}

/**
 * Verifies credentials and, on success, reports which tenant the caller enters.
 *
 * A valid password is not by itself enough to be useful: a user with no
 * membership has nothing to open, so that case is treated as a failed login
 * rather than producing a session that every subsequent page would reject.
 */
export async function authenticateCredentials(
  email: string,
  password: string,
  clientIdentifier = "unknown",
): Promise<LoginResult | null> {
  const throttles: LoginThrottle[] = [
    { key: accountThrottleKey(email), maxFailures: MAX_LOGIN_FAILURES },
    {
      key: networkThrottleKey(clientIdentifier),
      maxFailures: MAX_NETWORK_LOGIN_FAILURES,
    },
  ];
  if (await isLoginBlocked(throttles)) {
    return null;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Always verify, even when the account does not exist, to keep the response
  // time of both failures indistinguishable.
  const passwordMatches = await verifyPassword(
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    password,
  );

  if (!user || !passwordMatches || !user.isActive) {
    await registerLoginFailure(throttles);
    return null;
  }

  const resolved = await resolveTenantMembership(user.id);

  if (!resolved) {
    await registerLoginFailure(throttles);
    return null;
  }

  await prisma.authThrottle.deleteMany({
    where: { key: { in: inThrottleKeys(throttles) } },
  });

  return {
    user: { id: user.id, name: user.name, email: user.email, locale: user.locale },
    tenant: {
      id: resolved.tenant.id,
      name: resolved.tenant.name,
      slug: resolved.tenant.slug,
    },
    role: resolved.membership.role,
  };
}

function inThrottleKeys(throttles: LoginThrottle[]): string[] {
  return throttles.map((throttle) => throttle.key);
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

  await prisma.$transaction([
    prisma.session.deleteMany({
      where: { expiresAt: { lte: now } },
    }),
    prisma.session.create({
      data: {
        id: hashToken(token),
        userId,
        expiresAt,
      },
    }),
  ]);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
}

export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await prisma.session.deleteMany({ where: { id: hashToken(token) } });
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: true },
  });

  // Server Components may read cookies but cannot mutate them in Next.js. Leave an expired or
  // invalid cookie in place here; login overwrites it and the logout server action can delete it.
  if (!session || session.expiresAt <= new Date() || !session.user.isActive) {
    return null;
  }

  // Server Components may read cookies but cannot mutate them in Next.js. Avoid turning a
  // request-time authentication read into a database write; session cleanup happens when a new
  // session is created, and lastSeenAt remains a conservative activity marker.
  return session;
}

/**
 * Resolves the tenant this request is acting in, or null if there is no usable
 * session.
 *
 * The membership lookup is keyed on the session's own user id. That is the one
 * place the application reads memberships without a tenant already established,
 * and it is safe precisely because the predicate comes from the session rather
 * than from the request: a caller can only ever retrieve their own rows.
 *
 * A user who somehow holds several memberships is given their earliest one.
 * V1 provisions one tenant per priest, so this is a deliberate placeholder for
 * the tenant switcher that multi-membership will eventually need, and it fails
 * closed in the sense that it never widens access.
 */
export async function getTenantContext(): Promise<TenantContext | null> {
  const session = await getCurrentSession();
  if (!session) return null;

  const resolved = await resolveTenantMembership(session.userId);
  if (!resolved) return null;

  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      locale: session.user.locale,
    },
    membership: { id: resolved.membership.id, role: resolved.membership.role },
    tenant: {
      id: resolved.tenant.id,
      name: resolved.tenant.name,
      slug: resolved.tenant.slug,
    },
    sessionId: session.id,
  };
}

export async function requireTenantContext(): Promise<TenantContext> {
  const context = await getTenantContext();
  if (!context) redirect("/login");
  return context;
}

/**
 * The single authorization gate for pages, server actions and route handlers.
 *
 * Returning the context rather than a boolean matters: callers then have the
 * tenant id in hand and cannot accidentally go on to query using something the
 * request supplied.
 */
export async function requireCapability(capability: Capability): Promise<TenantContext> {
  const context = await requireTenantContext();
  if (!canAccess(context, capability)) redirect("/");
  return context;
}

export async function listUserSessions(userId: string) {
  return prisma.session.findMany({
    where: { userId },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
    },
  });
}

export async function getCurrentSessionId(): Promise<string | null> {
  return (await getCurrentSession())?.id ?? null;
}

/**
 * Revokes one of the caller's own sessions.
 *
 * The delete is scoped by both session id and user id in a single statement, so
 * a session belonging to somebody else cannot be removed even if the id is
 * guessed; the statement simply matches nothing.
 */
export async function revokeOwnSession(userId: string, sessionId: string): Promise<boolean> {
  const result = await prisma.session.deleteMany({
    where: { id: sessionId, userId },
  });
  return result.count > 0;
}

/**
 * Invalidates every session for this user except the one making the request.
 * Used after a password change so that a stolen cookie stops working the moment
 * the legitimate owner rotates their credentials.
 */
export async function revokeAllOtherSessions(
  userId: string,
  keepSessionId: string,
): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: { userId, id: { not: keepSessionId } },
  });
  return result.count;
}

export async function changeUserPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await verifyPassword(user.passwordHash, currentPassword))) {
    return false;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword) },
  });

  return true;
}
