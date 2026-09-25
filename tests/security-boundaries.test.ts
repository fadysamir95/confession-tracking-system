import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { authenticateCredentials } from "@/server/auth";
import type { TenantContext } from "@/server/auth";
import {
  archiveMember,
  createMember,
  permanentlyDeleteMember,
  restoreMember,
} from "@/server/member-service";
import { DomainError } from "@/server/errors";
import { addMemberToTenant, resetDatabase, seedTenant } from "./harness";
import { hashPassword } from "@/server/password";
import { withTenant } from "@/server/db";
import { USER_ROLES } from "@/lib/constants";

const PASSWORD = "CorrectHorseBatteryStaple!9";

let admin: TenantContext;
let limited: TenantContext;

async function reset() {
  await prisma.authThrottle.deleteMany();
  await resetDatabase(prisma);
}

beforeAll(async () => {
  await reset();
  admin = await seedTenant(prisma, { name: "Security parish" });
  limited = await addMemberToTenant(prisma, admin, {
    name: "Limited User",
    role: USER_ROLES.PRIEST,
  });

  // The login tests need a real Argon2id digest, because authentication now
  // verifies against Argon2id and a placeholder string would not parse.
  const passwordHash = await hashPassword(PASSWORD);
  await prisma.user.update({ where: { id: admin.user.id }, data: { passwordHash } });
});

beforeEach(async () => {
  await prisma.authThrottle.deleteMany();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${admin.tenant.id}, true)`;
    await tx.auditLog.deleteMany();
    await tx.confessionRecord.deleteMany();
    await tx.member.deleteMany();
  });
});

afterAll(async () => {
  await reset();
  await prisma.$disconnect();
});

async function seedArchivedMember(actor: TenantContext): Promise<string> {
  const memberId = await createMember(
    actor,
    {
      name: "Archived Subject",
      phone: undefined,
      customIntervalDays: undefined,
      lastConfessionDate: undefined,
      administrativeNote: undefined,
    },
    "2026-09-25",
  );
  await archiveMember(admin, memberId);
  return memberId;
}

function countFor(context: TenantContext, where: Record<string, unknown> = {}) {
  return withTenant(context.tenant.id, (db) => db.member.count({ where }));
}

function auditCount(context: TenantContext, where: Record<string, unknown>) {
  return withTenant(context.tenant.id, (db) => db.auditLog.count({ where }));
}

describe("login throttling", () => {
  const email = "throttle-target@example.test";
  const client = "203.0.113.10";

  it("rejects a wrong password without blocking the first attempts", async () => {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const result = await authenticateCredentials(email, "wrong", client);
      expect(result, `attempt ${attempt}`).toBeNull();
    }
    const rows = await prisma.authThrottle.findMany();
    expect(rows.every((row) => row.blockedUntil === null)).toBe(true);
  });

  it("blocks the account on the fifth consecutive failure", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await authenticateCredentials(email, "wrong", client);
    }
    const rows = await prisma.authThrottle.findMany();
    const blocked = rows.filter((row) => row.blockedUntil !== null);
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked[0]!.blockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it("refuses even correct credentials while the block is active", async () => {
    // The target account does exist, so this proves the block short-circuits the
    // password comparison rather than merely reporting a missing user.
    await prisma.authThrottle.deleteMany();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await authenticateCredentials(admin.user.email, `wrong-${attempt}`, client);
    }
    const result = await authenticateCredentials(admin.user.email, PASSWORD, client);
    expect(result).toBeNull();
  });

  it("keeps the account and network throttle keys separate", async () => {
    await prisma.authThrottle.deleteMany();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await authenticateCredentials(email, "wrong", client);
      const rows = await prisma.authThrottle.findMany();
      // Each attempt records one account key and one network key.
      expect(rows.map((row) => row.failureCount).sort()).toEqual([attempt + 1, attempt + 1]);
    }
    const rows = await prisma.authThrottle.findMany();
    expect(rows).toHaveLength(2);
    // The account threshold is 5; the network threshold is 30, so only the account key blocks.
    expect(rows.filter((row) => row.blockedUntil !== null)).toHaveLength(1);
  });

  it("clears the throttle state after a successful login and resolves the tenant", async () => {
    await prisma.authThrottle.deleteMany();
    await authenticateCredentials(admin.user.email, "wrong", client);
    expect(await prisma.authThrottle.count()).toBeGreaterThan(0);

    const result = await authenticateCredentials(admin.user.email, PASSWORD, client);
    expect(result).not.toBeNull();
    expect(result!.role).toBe(USER_ROLES.TENANT_ADMIN);
    // A successful login must resolve to the tenant the user actually belongs
    // to, never to anything the request supplied.
    expect(result!.tenant.id).toBe(admin.tenant.id);
    expect(await prisma.authThrottle.count()).toBe(0);
  });

  it("does not reveal whether an account exists", async () => {
    const missing = await authenticateCredentials(
      "does-not-exist@example.test",
      PASSWORD,
      "198.51.100.1",
    );
    const wrongPassword = await authenticateCredentials(
      admin.user.email,
      "nope",
      "198.51.100.2",
    );
    expect(missing).toBeNull();
    expect(wrongPassword).toBeNull();
  });
});

describe("capability enforcement in the member service", () => {
  it("refuses permanent deletion for the PRIEST role", async () => {
    const memberId = await seedArchivedMember(admin);
    await expect(permanentlyDeleteMember(limited, memberId, PASSWORD)).rejects.toBeInstanceOf(
      DomainError,
    );
  });

  it("leaves the member untouched when an unauthorized lifecycle call is rejected", async () => {
    const memberId = await seedArchivedMember(admin);

    // Permanent deletion is the operation a priest genuinely may not perform,
    // so the rejection here is real rather than an artefact of a role that was
    // never actually restricted. The assertion that matters is the one after
    // it: a refused call must not have half-applied.
    await expect(
      permanentlyDeleteMember(limited, memberId, PASSWORD),
    ).rejects.toMatchObject({ code: "ADMIN_ONLY_DELETE" });

    const member = await withTenant(admin.tenant.id, (db) =>
      db.member.findUnique({ where: { tenantId_id: { tenantId: admin.tenant.id, id: memberId } } }),
    );
    expect(member).not.toBeNull();
    expect(member?.archivedAt).not.toBeNull();
  });

  it("allows the PRIEST role to record attendance", async () => {
    const memberId = await createMember(
      limited,
      {
        name: "Recorded By Priest",
        phone: undefined,
        customIntervalDays: undefined,
        lastConfessionDate: undefined,
        administrativeNote: undefined,
      },
      "2026-09-25",
    );
    expect(memberId).toBeTruthy();
  });
});

describe("archive, restore, and step-up deletion", () => {
  it("writes an audit event atomically with each lifecycle change", async () => {
    const memberId = await seedArchivedMember(admin);
    expect(await auditCount(admin, { memberId, action: "MEMBER_ARCHIVED" })).toBe(1);

    await restoreMember(admin, memberId);
    expect(await auditCount(admin, { memberId, action: "MEMBER_RESTORED" })).toBe(1);

    await archiveMember(admin, memberId);
    expect(await auditCount(admin, { memberId, action: "MEMBER_ARCHIVED" })).toBe(2);
  });

  it("refuses to restore a member that is not archived", async () => {
    const memberId = await createMember(
      admin,
      {
        name: "Still Active",
        phone: undefined,
        customIntervalDays: undefined,
        lastConfessionDate: undefined,
        administrativeNote: undefined,
      },
      "2026-09-25",
    );
    await expect(restoreMember(admin, memberId)).rejects.toBeInstanceOf(DomainError);
  });

  it("refuses to archive a member that is already archived", async () => {
    const memberId = await seedArchivedMember(admin);
    await expect(archiveMember(admin, memberId)).rejects.toBeInstanceOf(DomainError);
  });

  it("requires the current administrator password for permanent deletion", async () => {
    const memberId = await seedArchivedMember(admin);
    await expect(permanentlyDeleteMember(admin, memberId, "")).rejects.toBeInstanceOf(DomainError);
    await expect(
      permanentlyDeleteMember(admin, memberId, "wrong-password"),
    ).rejects.toBeInstanceOf(DomainError);
    expect(await countFor(admin, { id: memberId })).toBe(1);
  });

  it("refuses to permanently delete a member who is not archived", async () => {
    const memberId = await createMember(
      admin,
      {
        name: "Active Not Deletable",
        phone: undefined,
        customIntervalDays: undefined,
        lastConfessionDate: undefined,
        administrativeNote: undefined,
      },
      "2026-09-25",
    );
    await expect(permanentlyDeleteMember(admin, memberId, PASSWORD)).rejects.toBeInstanceOf(
      DomainError,
    );
    expect(await countFor(admin, { id: memberId })).toBe(1);
  });

  it("deletes the member and removes its id from the audit trail on success", async () => {
    const memberId = await seedArchivedMember(admin);
    await permanentlyDeleteMember(admin, memberId, PASSWORD);

    expect(await countFor(admin, { id: memberId })).toBe(0);
    const deletion = await withTenant(admin.tenant.id, (db) =>
      db.auditLog.findFirst({
        where: { action: "MEMBER_PERMANENTLY_DELETED" },
        orderBy: { createdAt: "desc" },
      }),
    );
    expect(deletion).not.toBeNull();
    expect(deletion!.memberId).toBeNull();
  });
});
