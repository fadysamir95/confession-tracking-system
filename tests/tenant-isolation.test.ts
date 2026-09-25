import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { withTenant } from "@/server/db";
import {
  archiveMember,
  createMember,
  permanentlyDeleteMember,
  recordConfession,
  restoreMember,
  updateMember,
} from "@/server/member-service";
import { getMemberDetails } from "@/server/queries";
import { getSettings, updateSettings } from "@/server/settings";
import { addMemberToTenant, resetDatabase, seedTenant } from "./harness";
import { USER_ROLES } from "@/lib/constants";
import type { TenantContext } from "@/server/auth";

/**
 * Tenant isolation is the highest-priority requirement of this application, so
 * it is tested adversarially: two real tenants with real data, and every access
 * path is then driven with the *other* tenant's identifiers.
 *
 * These tests deliberately do not assert on error messages for cross-tenant
 * attempts. What matters is that no data crosses, and that a refusal looks
 * identical to a record that does not exist.
 */

let tenantA: TenantContext;
let tenantB: TenantContext;
let memberAId: string;
let memberBId: string;

const TODAY = "2026-09-25";

beforeAll(async () => {
  await resetDatabase(prisma);
  tenantA = await seedTenant(prisma, { name: "Priest A parish" });
  tenantB = await seedTenant(prisma, { name: "Priest B parish" });

  memberAId = await createMember(
    tenantA,
    { name: "Alpha Member", phone: "0100000001" },
    TODAY,
  );
  memberBId = await createMember(
    tenantB,
    { name: "Bravo Member", phone: "0200000001" },
    TODAY,
  );
});

afterAll(async () => {
  await resetDatabase(prisma);
  await prisma.$disconnect();
});

describe("cross-tenant reads", () => {
  it("returns no row when tenant A asks for tenant B's member by its real id", async () => {
    const result = await getMemberDetails(tenantA, memberBId);
    expect(result).toBeNull();
  });

  it("cannot distinguish another tenant's member from a nonexistent one", async () => {
    const foreign = await getMemberDetails(tenantA, memberBId);
    const nonexistent = await getMemberDetails(tenantA, "does-not-exist-at-all");
    expect(foreign).toBe(nonexistent);
  });

  it("returns no row at all when no tenant context is established", async () => {
    const leaked = await prisma.member.findMany();
    expect(leaked).toHaveLength(0);
  });

  it("lists only its own members on the dashboard query path", async () => {
    const visibleToA = await withTenant(tenantA.tenant.id, (db) =>
      db.member.findMany({ select: { id: true } }),
    );
    expect(visibleToA.map((m) => m.id)).toEqual([memberAId]);
    expect(visibleToA.map((m) => m.id)).not.toContain(memberBId);
  });

  it("keeps audit trails separate", async () => {
    await recordConfession(tenantA, memberAId, "2026-09-20", TODAY);

    const auditA = await withTenant(tenantA.tenant.id, (db) => db.auditLog.count());
    const auditB = await withTenant(tenantB.tenant.id, (db) => db.auditLog.count());
    expect(auditA).toBeGreaterThan(0);
    expect(auditB).toBeGreaterThan(0);
    expect(auditA).not.toBe(auditB);
  });
});

describe("cross-tenant writes", () => {
  it("refuses to update another tenant's member", async () => {
    await expect(
      updateMember(tenantA, { id: memberBId, name: "Hijacked", phone: "0200000001" }),
    ).rejects.toMatchObject({ code: "MEMBER_NOT_FOUND" });

    const unchanged = await withTenant(tenantB.tenant.id, (db) =>
      db.member.findUnique({ where: { tenantId_id: { tenantId: tenantB.tenant.id, id: memberBId } } }),
    );
    expect(unchanged?.name).toBe("Bravo Member");
  });

  it("refuses to record attendance against another tenant's member", async () => {
    await expect(
      recordConfession(tenantA, memberBId, "2026-09-21", TODAY),
    ).rejects.toMatchObject({ code: "MEMBER_NOT_FOUND" });
  });

  it("refuses to archive or restore another tenant's member", async () => {
    await expect(archiveMember(tenantA, memberBId)).rejects.toMatchObject({
      code: "MEMBER_NOT_FOUND",
    });
    await expect(restoreMember(tenantA, memberBId)).rejects.toMatchObject({
      code: "MEMBER_NOT_FOUND",
    });
  });

  it("refuses to permanently delete another tenant's member", async () => {
    await expect(permanentlyDeleteMember(tenantA, memberBId, "irrelevant")).rejects.toMatchObject({
      code: "ARCHIVED_MEMBER_NOT_FOUND",
    });

    const survivor = await withTenant(tenantB.tenant.id, (db) =>
      db.member.count({ where: { id: memberBId } }),
    );
    expect(survivor).toBe(1);
  });
});

describe("database-level enforcement", () => {
  it("refuses a row written against a foreign tenant, even from inside a valid context", async () => {
    await expect(
      withTenant(tenantA.tenant.id, (db) =>
        db.member.create({
          data: {
            tenantId: tenantB.tenant.id,
            name: "Sneaky",
            nameNormalized: "sneaky",
          },
        }),
      ),
    ).rejects.toBeDefined();
  });

  it("refuses a confession record pointing at another tenant's member", async () => {
    await expect(
      withTenant(tenantA.tenant.id, (db) =>
        db.confessionRecord.create({
          data: {
            tenantId: tenantA.tenant.id,
            memberId: memberBId,
            confessionDate: "2026-09-22",
            recordedById: tenantA.user.id,
          },
        }),
      ),
    ).rejects.toBeDefined();
  });

  it("refuses to attribute a record to somebody outside the tenant", async () => {
    await expect(
      withTenant(tenantA.tenant.id, (db) =>
        db.confessionRecord.create({
          data: {
            tenantId: tenantA.tenant.id,
            memberId: memberAId,
            confessionDate: "2026-09-23",
            recordedById: tenantB.user.id,
          },
        }),
      ),
    ).rejects.toBeDefined();
  });

  it("denies everything when the tenant context is empty", async () => {
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', '', true)`;
      return {
        members: await tx.member.count(),
        records: await tx.confessionRecord.count(),
        audit: await tx.auditLog.count(),
        settings: await tx.tenantSettings.count(),
        tenants: await tx.tenant.count(),
      };
    });
    expect(rows).toEqual({ members: 0, records: 0, audit: 0, settings: 0, tenants: 0 });
  });
});

describe("per-tenant settings", () => {
  it("does not let one tenant's settings change another's", async () => {
    await updateSettings(tenantA.tenant.id, {
      defaultIntervalDays: 21,
      dueSoonThresholdDays: 5,
      timezone: "Africa/Cairo",
      dateFormat: "DD/MM/YYYY",
      whatsappCountryCode: "20",
      whatsappTemplate: "A's private message",
    });

    const settingsA = await getSettings(tenantA.tenant.id, "ar");
    const settingsB = await getSettings(tenantB.tenant.id, "ar");

    expect(settingsA.defaultIntervalDays).toBe(21);
    expect(settingsA.whatsappTemplate).toBe("A's private message");
    expect(settingsB.whatsappTemplate).not.toBe("A's private message");
    expect(settingsB.whatsappTemplate).not.toContain("A's");
  });

  it("refuses to write settings into a foreign tenant", async () => {
    await expect(
      withTenant(tenantA.tenant.id, (db) =>
        db.tenantSettings.update({
          where: { tenantId: tenantB.tenant.id },
          data: { whatsappTemplate: "overwritten" },
        }),
      ),
    ).rejects.toBeDefined();
  });
});

describe("privilege separation inside a tenant", () => {
  it("lets a priest manage members but not delete them", async () => {
    const priest = await addMemberToTenant(prisma, tenantA, {
      name: "Assistant",
      role: USER_ROLES.PRIEST,
    });

    const memberId = await createMember(priest, { name: "Created By Priest" }, TODAY);
    expect(memberId).toBeTruthy();

    await expect(
      permanentlyDeleteMember(priest, memberId, "any-password"),
    ).rejects.toMatchObject({ code: "ADMIN_ONLY_DELETE" });
  });

  it("refuses to attribute a record to somebody outside the tenant", async () => {
    const outsider = await addMemberToTenant(prisma, tenantB, { name: "Outsider" });
    // A context claiming tenant A's tenancy while carrying tenant B's user is
    // not reachable through the real request path, which always derives the
    // context from the session. The point of the test is that even if such a
    // context were constructed by hand, the database refuses the write: the
    // composite foreign key requires the recorder to be a member of the very
    // tenant the record belongs to.
    const forged: TenantContext = { ...outsider, tenant: tenantA.tenant };

    await expect(
      createMember(
        forged,
        { name: "Forged", lastConfessionDate: "2026-09-20" },
        TODAY,
      ),
    ).rejects.toBeDefined();

    // The member row is rolled back with the failed record, so nothing is left
    // behind in tenant A.
    const leftovers = await withTenant(tenantA.tenant.id, (db) =>
      db.member.count({ where: { nameNormalized: "forged" } }),
    );
    expect(leftovers).toBe(0);
  });
});
