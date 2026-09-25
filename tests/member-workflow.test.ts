import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createMember, recordConfession } from "@/server/member-service";
import { resetDatabase, seedTenant } from "./harness";
import { DomainError } from "@/server/errors";

const TODAY = "2026-09-25";

// Provisioned inside beforeAll rather than at module scope: resetDatabase would
// otherwise delete a tenant created during collection.
let actor: Awaited<ReturnType<typeof seedTenant>>;

beforeAll(async () => {
  await resetDatabase(prisma);
  actor = await seedTenant(prisma, { name: "Workflow parish" });
});

afterAll(async () => {
  await resetDatabase(prisma);
  await prisma.$disconnect();
});

describe("member workflow service", () => {
  it("creates a member and optional date-only history", async () => {
    const memberId = await createMember(
      actor,
      {
        name: "John Doe",
        phone: "+20 100 123 4567",
        customIntervalDays: 45,
        lastConfessionDate: "2026-08-15",
        administrativeNote: undefined,
      },
      TODAY,
    );

    const member = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${actor.tenant.id}, true)`;
      return tx.member.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: actor.tenant.id, id: memberId } },
        include: { records: true },
      });
    });

    expect(member.lastConfessionDate).toBe("2026-08-15");
    expect(member.confessionIntervalDays).toBe(45);
    expect(member.records).toHaveLength(1);

    const auditCount = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${actor.tenant.id}, true)`;
      return tx.auditLog.count({ where: { memberId } });
    });
    expect(auditCount).toBe(1);
  });

  it("records a new confession and updates the last date atomically", async () => {
    const memberId = await createMember(
      actor,
      {
        name: "Mark Smith",
        phone: undefined,
        customIntervalDays: undefined,
        lastConfessionDate: "2026-08-01",
        administrativeNote: undefined,
      },
      TODAY,
    );

    await recordConfession(actor, memberId, "2026-09-25", TODAY);

    const member = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${actor.tenant.id}, true)`;
      return tx.member.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: actor.tenant.id, id: memberId } },
        include: { records: { orderBy: { confessionDate: "desc" } } },
      });
    });

    expect(member.lastConfessionDate).toBe("2026-09-25");
    expect(member.records.map((record) => record.confessionDate)).toEqual([
      "2026-09-25",
      "2026-08-01",
    ]);

    const auditCount = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${actor.tenant.id}, true)`;
      return tx.auditLog.count({
        where: { memberId, action: "CONFESSION_RECORDED" },
      });
    });
    expect(auditCount).toBe(1);
  });

  it("rejects future, duplicate, and out-of-order dates", async () => {
    const memberId = await createMember(
      actor,
      {
        name: "Peter John",
        phone: undefined,
        customIntervalDays: undefined,
        lastConfessionDate: "2026-09-20",
        administrativeNote: undefined,
      },
      TODAY,
    );

    await expect(
      recordConfession(actor, memberId, "2026-09-26", TODAY),
    ).rejects.toMatchObject<Partial<DomainError>>({ code: "FUTURE_DATE" });
    await expect(
      recordConfession(actor, memberId, "2026-09-19", TODAY),
    ).rejects.toMatchObject<Partial<DomainError>>({ code: "DATE_OUT_OF_ORDER" });
    await expect(
      recordConfession(actor, memberId, "2026-09-20", TODAY),
    ).rejects.toMatchObject<Partial<DomainError>>({ code: "DUPLICATE_DATE" });
  });
});
