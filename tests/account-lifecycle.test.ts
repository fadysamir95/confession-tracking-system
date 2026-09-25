import { createHash } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { withTenant } from "@/server/db";
import {
  completePasswordReset,
  registerWithInvite,
  requestPasswordReset,
} from "@/server/account";
import { createInvite, redeemInvite, validateInvite } from "@/server/invites";
import {
  authenticateCredentials,
  createSession,
  destroyCurrentSession,
  getCurrentSession,
  SESSION_COOKIE_NAME,
} from "@/server/auth";
import { USER_ROLES } from "@/lib/constants";
import type { Locale } from "@/lib/i18n";
import { DomainError } from "@/server/errors";
import { resetDatabase, seedTenant, trackTenant } from "./harness";
import { activeCookieStore } from "./request-scope";

/**
 * Onboarding and account recovery.
 *
 * These paths sit outside any tenant context for part of their work — resolving
 * an invitation and looking up a user by email both happen before a tenant is
 * known — so they are exactly where a multi-tenant design is most likely to
 * leak. Every test here is written to pin down where the tenant id comes from,
 * and to prove that nothing in the request can influence it.
 *
 * The mailer is mocked at module level so reset tokens can be read directly
 * instead of being parsed out of console output.
 */

const sentMail: Array<{ email: string; token: string }> = [];

vi.mock("@/server/mailer", () => ({
  sendPasswordResetEmail: vi.fn(async (email: string, token: string) => {
    sentMail.push({ email, token });
    return { delivered: true as const };
  }),
}));

// Session functions read and write the cookie through Next's request scope,
// which does not exist under Vitest. The fake store reproduces get/set/delete
// and records the security attributes so the tests can assert on them.
vi.mock("next/headers", () => ({
  cookies: async () => activeCookieStore,
  headers: async () => new Headers(),
}));

const PASSWORD = "CorrectHorse9!Battery";

/**
 * The interface language these accounts are created in.
 *
 * Pinned rather than defaulted so a test that later asserts on the reminder
 * template a new tenant starts with has a definite language to assert against.
 */
const TEST_LOCALE: Locale = "ar";

/**
 * Reset before every test, not just once per file.
 *
 * Nearly every test here creates an account with a fixed address. A single
 * reset at the top of the file leaves the previous test's users behind, so the
 * suite's outcome starts depending on which test happened to run first — the
 * kind of coupling that turns a real failure into a confusing one. Each test
 * gets a clean database and can be run in isolation with the same result.
 */
beforeEach(async () => {
  await resetDatabase(prisma);
  sentMail.length = 0;
  activeCookieStore.clear();
  vi.clearAllMocks();
});

afterAll(async () => {
  await resetDatabase(prisma);
});

/** Inserts a platform-level invitation directly, as the operator CLI would. */
async function mintPlatformInvite(overrides: {
  role?: (typeof USER_ROLES)[keyof typeof USER_ROLES];
  tenantName?: string | null;
  email?: string | null;
  expiresAt?: Date;
  maxUses?: number;
}): Promise<string> {
  const { generateCode, hashCode } = await import("@/lib/invite-code");
  const code = generateCode();
  await prisma.inviteCode.create({
    data: {
      codeHash: hashCode(code),
      role: overrides.role ?? USER_ROLES.TENANT_ADMIN,
      tenantId: null,
      tenantName: overrides.tenantName ?? null,
      email: overrides.email ?? null,
      maxUses: overrides.maxUses ?? 1,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1_000),
      createdById: null,
    },
  });
  return code;
}

describe("invitation codes", () => {
  it("stores only a digest, never the code itself", async () => {
    const code = await mintPlatformInvite({});
    const rows = await prisma.inviteCode.findMany();
    const expectedHash = createHash("sha256").update(code).digest("hex");

    expect(rows.some((row) => row.codeHash === code)).toBe(false);
    expect(rows.some((row) => row.codeHash === expectedHash)).toBe(true);
  });

  it("accepts a pasted code with lowercase letters and spaces", async () => {
    const code = await mintPlatformInvite({});
    const messy = `  ${code.toLowerCase().split("").join(" ")}  `;

    const validated = await validateInvite(messy);
    expect(validated).not.toBeNull();
  });

  it("rejects a code that was never issued", async () => {
    expect(await validateInvite("ZZZZZZZZZZZZZZZZZZZZZZZZ")).toBeNull();
    await expect(
      redeemInvite("ZZZZZZZZZZZZZZZZZZZZZZZZ", async () => "unreachable"),
    ).rejects.toMatchObject({ code: "INVALID_INVITE" });
  });

  it("rejects an expired code and reports it as expired rather than invalid", async () => {
    const code = await mintPlatformInvite({ expiresAt: new Date(Date.now() - 1_000) });
    await expect(
      redeemInvite(code, async () => "unreachable"),
    ).rejects.toMatchObject({ code: "INVITE_EXPIRED" });
  });

  it("reports a spent code as used rather than as an unknown code", async () => {
    const code = await mintPlatformInvite({});
    await redeemInvite(code, async () => "done");

    await expect(
      redeemInvite(code, async () => "unreachable"),
    ).rejects.toMatchObject({ code: "INVITE_USED" });
  });

  it("leaves a code unused when the handler throws", async () => {
    const code = await mintPlatformInvite({ maxUses: 1 });

    await expect(
      redeemInvite(code, async () => {
        throw new Error("handler exploded");
      }),
    ).rejects.toThrow("handler exploded");

    // The increment and the handler share one transaction, so a failed
    // registration must not burn the invitation. If it did, a genuine priest
    // who hit a transient error would be locked out by a retry.
    const rows = await prisma.inviteCode.findMany({
      where: { codeHash: createHash("sha256").update(code).digest("hex") },
    });
    expect(rows[0]?.usedCount).toBe(0);
    expect(await validateInvite(code)).not.toBeNull();
  });

  it("lets only one of two simultaneous redemptions through", async () => {
    const code = await mintPlatformInvite({ maxUses: 1 });

    const attempt = async (label: string) => {
      const email = `${label}@example.com`;
      return registerWithInvite({ inviteCode: code, name: label, email, password: PASSWORD, locale: TEST_LOCALE });
    };

    const results = await Promise.allSettled([attempt("first"), attempt("second")]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);

    // The winning attempt provisioned a tenant, so hand its id to the harness.
    // Without this the tenant outlives the test and the next one trips over the
    // leftover email — a leak in the test rather than in the application, but it
    // fails just as confusingly.
    for (const result of results) {
      if (result.status === "fulfilled") trackTenant(result.value.tenantId);
    }
  });
});

describe("tenant invitation scope", () => {
  it("cannot be pointed at a tenant other than the caller's own", async () => {
    const admin = await seedTenant(prisma, { name: "Admin Parish" });
    const other = await seedTenant(prisma, { name: "Other Parish" });

    // The function signature has no tenant parameter at all, which is the
    // point: there is no argument through which a different tenant id could be
    // supplied, so this cannot be bypassed by crafting a request.
    const invite = await createInvite(admin, { role: USER_ROLES.PRIEST });

    const stored = await prisma.inviteCode.findUnique({
      where: { codeHash: createHash("sha256").update(invite.code).digest("hex") },
    });
    expect(stored?.tenantId).toBe(admin.tenant.id);
    expect(stored?.tenantId).not.toBe(other.tenant.id);
  });

  it("refuses a priest the ability to widen access", async () => {
    const admin = await seedTenant(prisma, { name: "Admin Parish" });
    const priest = await seedTenant(prisma, { name: "Priest Parish", role: USER_ROLES.PRIEST });

    // The specific code rather than a generic FORBIDDEN: a role refusal that
    // only says "forbidden" is indistinguishable from a cross-tenant refusal,
    // and the two are read by different people. The code is what the action
    // layer turns into a sentence in the reader's language.
    await expect(createInvite(priest, {})).rejects.toMatchObject({
      code: "ADMIN_ONLY_INVITE",
    });
    // The admin's own invitation still works, proving the refusal above was
    // about the role and not about invites being broken generally.
    await expect(createInvite(admin, {})).resolves.toMatchObject({ code: expect.any(String) });
  });
});

describe("registration", () => {
  it("provisions a tenant and makes the first registrant its administrator", async () => {
    const code = await mintPlatformInvite({ tenantName: "New Parish" });

    const result = await registerWithInvite({
      inviteCode: code,
      name: "Fr. Andrew",
      email: "Andrew@Example.com",
      password: PASSWORD, locale: TEST_LOCALE,
    });
    trackTenant(result.tenantId);

    expect(result.tenantName).toBe("New Parish");
    // The submitted address is stored normalized.
    const user = await prisma.user.findUnique({ where: { email: "andrew@example.com" } });
    expect(user).not.toBeNull();

    const membership = await prisma.tenantMembership.findFirst({
      where: { tenantId: result.tenantId, userId: user!.id },
    });
    expect(membership?.role).toBe(USER_ROLES.TENANT_ADMIN);

    // Settings must exist for the new tenant, or the dashboard has nothing to
    // read on first load.
    const settings = await withTenant(result.tenantId, (db) =>
      db.tenantSettings.findUnique({ where: { tenantId: result.tenantId } }),
    );
    expect(settings).not.toBeNull();
  });

  it("gives two separate invitations two completely separate tenants", async () => {
    const first = await registerWithInvite({
      inviteCode: await mintPlatformInvite({ tenantName: "Parish One" }),
      name: "Fr. One",
      email: "one@example.com",
      password: PASSWORD, locale: TEST_LOCALE,
    });
    const second = await registerWithInvite({
      inviteCode: await mintPlatformInvite({ tenantName: "Parish Two" }),
      name: "Fr. Two",
      email: "two@example.com",
      password: PASSWORD, locale: TEST_LOCALE,
    });
    trackTenant(first.tenantId);
    trackTenant(second.tenantId);

    expect(first.tenantId).not.toBe(second.tenantId);

    // Each registrant must see only their own tenant, with no context set.
    const visibleWithoutContext = await prisma.tenant.findMany();
    expect(visibleWithoutContext).toHaveLength(0);
  });

  it("adds a registrant to the invited tenant and grants no other access", async () => {
    const existing = await seedTenant(prisma, { name: "Shared Parish" });
    const { generateCode, hashCode } = await import("@/lib/invite-code");
    const code = generateCode();
    await prisma.inviteCode.create({
      data: {
        codeHash: hashCode(code),
        role: USER_ROLES.PRIEST,
        tenantId: existing.tenant.id,
        tenantName: null,
        email: null,
        maxUses: 1,
        expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
        createdById: existing.user.id,
      },
    });

    const result = await registerWithInvite({
      inviteCode: code,
      name: "Fr. Second",
      email: "second@example.com",
      password: PASSWORD, locale: TEST_LOCALE,
    });

    expect(result.tenantId).toBe(existing.tenant.id);

    const memberships = await prisma.tenantMembership.findMany({
      where: { userId: (await prisma.user.findUnique({
        where: { email: "second@example.com" },
      }))!.id },
    });
    expect(memberships).toHaveLength(1);
  });

  it("refuses a duplicate email without creating a tenant", async () => {
    await registerWithInvite({
      inviteCode: await mintPlatformInvite({ tenantName: "Original" }),
      name: "Fr. Original",
      email: "taken@example.com",
      password: PASSWORD, locale: TEST_LOCALE,
    });
    const before = await prisma.tenant.findMany();

    await expect(
      registerWithInvite({
        inviteCode: await mintPlatformInvite({ tenantName: "Impostor" }),
        name: "Fr. Impostor",
        email: "TAKEN@example.com",
        password: PASSWORD,
        locale: TEST_LOCALE,
      }),
    ).rejects.toBeInstanceOf(DomainError);

    // The whole transaction rolls back, so no orphaned tenant is left behind.
    expect(await prisma.tenant.findMany()).toHaveLength(before.length);
  });
});

describe("password reset", () => {
  async function seedUser(email: string): Promise<{ userId: string; tenantId: string }> {
    const code = await mintPlatformInvite({ tenantName: "Reset Parish" });
    const result = await registerWithInvite({
      inviteCode: code,
      name: "Fr. Reset",
      email,
      password: PASSWORD, locale: TEST_LOCALE,
    });
    trackTenant(result.tenantId);
    const user = await prisma.user.findUnique({ where: { email } });
    return { userId: user!.id, tenantId: result.tenantId };
  }

  it("emails a link and changes the password when followed", async () => {
    const { userId } = await seedUser("reset@example.com");
    await requestPasswordReset("reset@example.com", "203.0.113.1");

    expect(sentMail).toHaveLength(1);
    expect(sentMail[0]?.email).toBe("reset@example.com");

    const result = await completePasswordReset(sentMail[0]!.token, "BrandNew7!Passphrase");
    expect(result.ok).toBe(true);

    // The new password must actually authenticate, which is the only part of
    // this that proves the hash was written and not just that the token was
    // consumed.
    expect(await authenticateCredentials("reset@example.com", "BrandNew7!Passphrase")).not.toBeNull();
    expect(await authenticateCredentials("reset@example.com", PASSWORD)).toBeNull();

    // Following the same link a second time must fail.
    const after = await completePasswordReset(sentMail[0]!.token, "AnotherPass8!word");
    expect(after.ok).toBe(false);

    const sessions = await prisma.session.findMany({ where: { userId } });
    expect(sessions).toHaveLength(0);
  });

  it("never stores the token in plain text", async () => {
    await seedUser("digest@example.com");
    await requestPasswordReset("digest@example.com", "203.0.113.2");
    const token = sentMail[0]!.token;

    const rows = await prisma.passwordResetToken.findMany();
    expect(rows.some((row) => row.tokenHash === token)).toBe(false);
    expect(
      rows.some((row) => row.tokenHash === createHash("sha256").update(token).digest("hex")),
    ).toBe(true);
  });

  it("sends nothing and stores nothing for an unknown address", async () => {
    const before = await prisma.passwordResetToken.count();

    await requestPasswordReset("nobody@example.com", "203.0.113.3");

    expect(sentMail).toHaveLength(0);
    // Counted as a delta rather than an absolute, because earlier tests in this
    // describe block leave their own legitimately-issued tokens behind.
    expect(await prisma.passwordResetToken.count()).toBe(before);
  });

  it("rejects a forged token", async () => {
    await seedUser("forged@example.com");
    const result = await completePasswordReset("A".repeat(43), "BrandNew7!Passphrase");
    expect(result.ok).toBe(false);
  });

  it("rejects an already-used token", async () => {
    await seedUser("reuse@example.com");
    await requestPasswordReset("reuse@example.com", "203.0.113.4");
    const token = sentMail[0]!.token;

    expect((await completePasswordReset(token, "BrandNew7!Passphrase")).ok).toBe(true);
    expect((await completePasswordReset(token, "BrandNew7!Passphrase")).ok).toBe(false);
  });

  it("invalidates an expired token", async () => {
    const { userId } = await seedUser("expired@example.com");
    await prisma.passwordResetToken.deleteMany();
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: createHash("sha256").update("expired-token").digest("hex"),
        expiresAt: new Date(Date.now() - 1_000),
      },
    });

    const result = await completePasswordReset("expired-token", "BrandNew7!Passphrase");
    expect(result.ok).toBe(false);
  });

  it("supersedes an earlier token when a second request arrives", async () => {
    await seedUser("supersede@example.com");

    await requestPasswordReset("supersede@example.com", "203.0.113.5");
    const first = sentMail[0]!.token;
    await requestPasswordReset("supersede@example.com", "203.0.113.5");
    const second = sentMail[1]!.token;

    // The older link must stop working, so a link that leaked from an earlier
    // request cannot be used after the account holder asks for a new one.
    expect((await completePasswordReset(first, "BrandNew7!Passphrase")).ok).toBe(false);
    expect((await completePasswordReset(second, "BrandNew7!Passphrase")).ok).toBe(true);
  });

  it("throttles repeated probes for an address that has no account", async () => {
    // The counter is only advanced when a lookup fails, so this is the path it
    // actually guards: using the form to enumerate which addresses are
    // registered. After the limit is reached, further requests are dropped
    // before the database is even consulted.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await requestPasswordReset("absent@example.com", "203.0.113.7");
    }

    const blocked = await prisma.authThrottle.findFirst({
      where: { key: createHash("sha256").update("reset:account:absent@example.com").digest("hex") },
    });
    expect(blocked?.blockedUntil).not.toBeNull();
    expect(blocked?.blockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it("scopes the reset throttle per address, so one account cannot lock out another", async () => {
    await seedUser("victim@example.com");

    // Exhaust the limit on an address that does not exist.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await requestPasswordReset("absent@example.com", "203.0.113.8");
    }

    // A different, real account must still be able to recover its password.
    sentMail.length = 0;
    await requestPasswordReset("victim@example.com", "203.0.113.9");
    expect(sentMail).toHaveLength(1);
  });
});

describe("sessions", () => {
  // Imported rather than written out: the name is environment-dependent, and a
  // hardcoded copy would pass against the wrong cookie outside production.
  const COOKIE = SESSION_COOKIE_NAME;

  async function seedSessionUser(email: string): Promise<{ userId: string; tenantId: string }> {
    const result = await registerWithInvite({
      inviteCode: await mintPlatformInvite({ tenantName: "Session Parish" }),
      name: "Fr. Session",
      email,
      password: PASSWORD, locale: TEST_LOCALE,
    });
    trackTenant(result.tenantId);
    const user = await prisma.user.findUnique({ where: { email } });
    return { userId: user!.id, tenantId: result.tenantId };
  }

  it("stores a session whose id is a digest, never the cookie value", async () => {
    const { userId } = await seedSessionUser("digest-session@example.com");

    await createSession(userId);

    const cookie = activeCookieStore.inspect(COOKIE);
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.value.length).toBeGreaterThanOrEqual(43);

    const stored = await prisma.session.findMany({ where: { userId } });
    expect(stored).toHaveLength(1);
    // A stolen database must not yield a usable cookie.
    expect(stored[0]?.id).not.toBe(cookie?.value);
    expect(stored[0]?.id).toBe(createHash("sha256").update(cookie!.value).digest("hex"));
  });

  it("sets the session cookie http-only, strict, and root-scoped", async () => {
    const { userId } = await seedSessionUser("flags@example.com");
    await createSession(userId);

    const cookie = activeCookieStore.inspect(COOKIE);
    // Without these, script could read the session and same-site requests could
    // ride along on it.
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("strict");
    expect(cookie?.path).toBe("/");
  });

  it("resolves the session back to the same user", async () => {
    const { userId } = await seedSessionUser("resolve@example.com");
    await createSession(userId);

    const session = await getCurrentSession();
    expect(session?.userId).toBe(userId);
  });

  it("returns nothing once the row is gone, even with the cookie still present", async () => {
    const { userId } = await seedSessionUser("revoked@example.com");
    await createSession(userId);
    expect(await getCurrentSession()).not.toBeNull();

    // Simulates server-side invalidation, which is what a password reset does.
    await prisma.session.deleteMany({ where: { userId } });

    // The cookie survives in the browser, but the server no longer honours it.
    expect(activeCookieStore.inspect(COOKIE)?.value).toBeTruthy();
    expect(await getCurrentSession()).toBeNull();
  });

  it("returns nothing for an expired session", async () => {
    const { userId } = await seedSessionUser("expired-session@example.com");
    await createSession(userId);
    await prisma.session.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    expect(await getCurrentSession()).toBeNull();
  });

  it("deletes both the row and the cookie on logout", async () => {
    const { userId } = await seedSessionUser("logout@example.com");
    await createSession(userId);

    await destroyCurrentSession();

    expect(await prisma.session.count({ where: { userId } })).toBe(0);
    expect(activeCookieStore.inspect(COOKIE)).toBeUndefined();
    expect(await getCurrentSession()).toBeNull();
  });

  it("signs a user out everywhere after a password reset", async () => {
    const { userId } = await seedSessionUser("reset-sessions@example.com");
    await createSession(userId);
    await createSession(userId);
    expect(await prisma.session.count({ where: { userId } })).toBe(2);

    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: createHash("sha256").update("signout-token").digest("hex"),
        expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
      },
    });
    const result = await completePasswordReset("signout-token", "BrandNew7!Passphrase");
    expect(result.ok).toBe(true);

    expect(await prisma.session.count({ where: { userId } })).toBe(0);
    expect(await getCurrentSession()).toBeNull();
  });

  it("purges expired rows when a new session is created", async () => {
    const { userId } = await seedSessionUser("purge@example.com");
    await prisma.session.create({
      data: {
        id: createHash("sha256").update("stale").digest("hex"),
        userId,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    await createSession(userId);

    const live = await prisma.session.findMany({ where: { userId } });
    expect(live).toHaveLength(1);
  });

  it("issues a distinct token per session", async () => {
    const { userId } = await seedSessionUser("unique@example.com");

    // Two sign-ins must not collide on a single row, or the second would appear
    // to replace the first while both tabs still believe they are signed in.
    await createSession(userId);
    const tokenA = activeCookieStore.inspect(COOKIE)?.value;
    await createSession(userId);
    const tokenB = activeCookieStore.inspect(COOKIE)?.value;

    expect(tokenA).toBeTruthy();
    expect(tokenB).toBeTruthy();
    expect(tokenA).not.toBe(tokenB);
    expect(await prisma.session.count({ where: { userId } })).toBe(2);
  });
});
