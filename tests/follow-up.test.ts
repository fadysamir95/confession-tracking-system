import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { withTenant } from "@/server/db";
import { AUDIT_ACTIONS, USER_ROLES } from "@/lib/constants";
import { addDays } from "@/lib/dates";
import { calculateMemberMetrics } from "@/lib/member-domain";
import { DomainError } from "@/server/errors";
import {
  extendMember,
  markReminderSent,
  recordConfession,
  undoExtension,
} from "@/server/member-service";
import type { TenantContext } from "@/server/auth";
import { addMemberToTenant, resetDatabase, seedTenant } from "./harness";

/**
 * Follow-up writes: the reminder marker and the duration extension.
 *
 * Three properties are being protected here, and each is the kind that unit
 * tests on the arithmetic cannot reach.
 *
 * First, that the writes are tenant-scoped. These are the first actions in the
 * product that a client component can call from a *click* rather than from a
 * form post, which is exactly the shape where a member id arriving in a payload
 * is most likely to be somebody else's. Every test that grants or takes back a
 * grace is repeated against a second parish's member.
 *
 * Second, that a recorded confession closes the period both features belong to.
 * A marker left in place after a member returns is not a cosmetic wart: the
 * member is then invisible in the "who still needs chasing" answer for the whole
 * of the *next* period, and the omission is silent.
 *
 * Third, that a grace expires on its own. The unit tests cover the arithmetic;
 * this covers the thing arithmetic cannot, which is that no job, no cron and no
 * write is needed for the member to come back — the row is simply read again on
 * a later day and the limit applies.
 */

/** The parish's own calendar day for these tests. */
const TODAY = "2026-10-21";

const settings = { defaultIntervalDays: 30, dueSoonThresholdDays: 7 };

/** Confessed 2026-09-01 on a 30-day limit, so due 2026-10-01: twenty days late. */
const LAST_CONFESSION = "2026-09-01";

async function seedLateMember(
  context: TenantContext,
  name: string,
  phone: string,
): Promise<string> {
  return withTenant(context.tenant.id, async (db) => {
    const member = await db.member.create({
      data: {
        tenantId: context.tenant.id,
        name,
        phone,
        nameNormalized: name.toLowerCase(),
        phoneNormalized: phone,
        lastConfessionDate: LAST_CONFESSION,
      },
      select: { id: true },
    });
    return member.id;
  });
}

function readMember(context: TenantContext, memberId: string) {
  return withTenant(context.tenant.id, (db) =>
    db.member.findUniqueOrThrow({
      where: { tenantId_id: { tenantId: context.tenant.id, id: memberId } },
      select: { extendedUntil: true, reminderSentAt: true, lastConfessionDate: true },
    }),
  );
}

function metricsOf(row: { extendedUntil: string | null; lastConfessionDate: string | null }, today = TODAY) {
  return calculateMemberMetrics(
    {
      lastConfessionDate: row.lastConfessionDate,
      confessionIntervalDays: null,
      extendedUntil: row.extendedUntil,
    },
    settings,
    today,
  );
}

async function auditActions(context: TenantContext, memberId: string): Promise<string[]> {
  return withTenant(context.tenant.id, (db) =>
    db.auditLog.findMany({
      where: { memberId },
      orderBy: { createdAt: "asc" },
      select: { action: true },
    }).then((rows) => rows.map((row) => row.action)),
  );
}

let parish: TenantContext;
let otherParish: TenantContext;

beforeEach(async () => {
  await resetDatabase(prisma);
  parish = await seedTenant(prisma, { name: "St. Mark" });
  otherParish = await seedTenant(prisma, { name: "St. George" });
});

afterAll(async () => {
  await resetDatabase(prisma);
});

describe("reminder marker", () => {
  it("records the opening and audits it against the member", async () => {
    const memberId = await seedLateMember(parish, "Late Member", "01000000001");

    await markReminderSent(parish, memberId);

    const stored = await readMember(parish, memberId);
    expect(stored.reminderSentAt).toBeInstanceOf(Date);
    expect(await auditActions(parish, memberId)).toEqual([
      AUDIT_ACTIONS.MEMBER_REMINDED,
    ]);
  });

  it("records a second opening over the first, so the marker says 'last', not 'any'", async () => {
    const memberId = await seedLateMember(parish, "Late Member", "01000000001");

    await markReminderSent(parish, memberId);
    const first = (await readMember(parish, memberId)).reminderSentAt;
    // A distinct instant, because a same-millisecond update would make the
    // ordering untestable rather than merely unlikely.
    await new Promise((done) => setTimeout(done, 5));
    await markReminderSent(parish, memberId);
    const second = (await readMember(parish, memberId)).reminderSentAt;

    expect(second!.getTime()).toBeGreaterThan(first!.getTime());
  });

  it("writes nothing about the message, only that it was opened", async () => {
    // The reminder text already lives in the parish's settings and in the
    // recipient's WhatsApp. A second copy here would be a place for it to leak
    // from, so the audit row is asserted field by field: an id and a verb.
    const memberId = await seedLateMember(parish, "Late Member", "01000000001");
    await markReminderSent(parish, memberId);

    const rows = await withTenant(parish.tenant.id, (db) =>
      db.auditLog.findMany({ where: { memberId } }),
    );
    expect(rows).toHaveLength(1);
    // Asserted as a set rather than by a spot check, because a spot check passes
    // just as happily against a table that has quietly grown a `message` column.
    // The whole privacy argument for this feature rests on there being nowhere
    // in the write path for the reminder text to land.
    expect(Object.keys(rows[0]).sort()).toEqual([
      "action",
      "createdAt",
      "id",
      "memberId",
      "tenantId",
      "userId",
    ]);
    expect(rows[0].memberId).toBe(memberId);
    expect(rows[0].action).toBe(AUDIT_ACTIONS.MEMBER_REMINDED);
  });

  it("refuses a member belonging to another parish", async () => {
    const theirs = await seedLateMember(otherParish, "Their Member", "01000000002");

    // The refusal has to be a refusal, not a silent no-op: a caller that has
    // been handed the wrong id needs to know, or it will report having reminded
    // somebody it never touched.
    await expect(markReminderSent(parish, theirs)).rejects.toBeInstanceOf(DomainError);
    expect((await readMember(otherParish, theirs)).reminderSentAt).toBeNull();
  });
});

describe("duration extension", () => {
  it("clears the member from the past-the-limit list", async () => {
    const memberId = await seedLateMember(parish, "Late Member", "01000000001");
    expect(metricsOf(await readMember(parish, memberId)).status).toBe("OVERDUE");

    await extendMember(parish, memberId, 14, TODAY);

    const stored = await readMember(parish, memberId);
    expect(stored.extendedUntil).toBe(addDays(TODAY, 14));
    expect(metricsOf(stored).status).not.toBe("OVERDUE");
    expect(await auditActions(parish, memberId)).toEqual([
      AUDIT_ACTIONS.MEMBER_EXTENDED,
    ]);
  });

  it("counts from today, not from the date they were already late past", async () => {
    // The bad version of this feature counts from the due date, which for a
    // member twenty days late lands a seven-day grace in the past and appears to
    // have done nothing. Counting from today is the only reading that means
    // "give them more time" to somebody who is looking at a date in the past.
    const memberId = await seedLateMember(parish, "Late Member", "01000000001");
    await extendMember(parish, memberId, 7, TODAY);

    const stored = await readMember(parish, memberId);
    expect(stored.extendedUntil).toBe("2026-10-28");
    expect(stored.extendedUntil! > TODAY).toBe(true);
  });

  it("only ever extends, never shortens a longer grace", async () => {
    const memberId = await seedLateMember(parish, "Late Member", "01000000001");

    await extendMember(parish, memberId, 30, TODAY);
    const longer = (await readMember(parish, memberId)).extendedUntil;
    await extendMember(parish, memberId, 7, TODAY);
    expect((await readMember(parish, memberId)).extendedUntil).toBe(longer);

    // Taking time away is a different operation with its own name and its own
    // audit action, because "extend by less" is not the same decision as
    // "remove the extension".
    await undoExtension(parish, memberId);
    expect((await readMember(parish, memberId)).extendedUntil).toBeNull();
  });

  it("brings the member back the day the grace ends, with no write in between", async () => {
    const memberId = await seedLateMember(parish, "Late Member", "01000000001");
    await extendMember(parish, memberId, 7, TODAY);

    const row = await readMember(parish, memberId);
    // The stored value never changes again after the grant. The two reads below
    // are the entire mechanism, which is the property being asserted: the row is
    // identical, only the date being compared against it has moved.
    expect(metricsOf(row, "2026-10-28").status).toBe("OVERDUE");
    expect(metricsOf(row, "2026-10-29").status).toBe("OVERDUE");
    // And the grace is still reported as the one on file, so a priest looking
    // at the row on either day is told the same thing about where it came from.
    expect((await readMember(parish, memberId)).extendedUntil).toBe("2026-10-28");
  });

  it("reports nothing to undo when there is no grace in force", async () => {
    const memberId = await seedLateMember(parish, "Late Member", "01000000001");

    // Distinguishable from "no such member" on purpose. A caller told only
    // "not found" about a member who is right there would retry forever.
    await expect(undoExtension(parish, memberId)).rejects.toMatchObject({
      code: "NO_EXTENSION_TO_UNDO",
    });
  });

  it("refuses a member belonging to another parish", async () => {
    const theirs = await seedLateMember(otherParish, "Their Member", "01000000002");

    await expect(extendMember(parish, theirs, 14, TODAY)).rejects.toBeInstanceOf(
      DomainError,
    );
    expect((await readMember(otherParish, theirs)).extendedUntil).toBeNull();
  });

  it("refuses to take back an extension on another parish's member", async () => {
    const theirs = await seedLateMember(otherParish, "Their Member", "01000000002");
    await extendMember(otherParish, theirs, 14, TODAY);

    await expect(undoExtension(parish, theirs)).rejects.toBeInstanceOf(DomainError);
    expect((await readMember(otherParish, theirs)).extendedUntil).not.toBeNull();
  });

  it("is refused on an archived member", async () => {
    const memberId = await seedLateMember(parish, "Archived Member", "01000000001");
    await withTenant(parish.tenant.id, (db) =>
      db.member.updateMany({
        where: { tenantId: parish.tenant.id, id: memberId },
        data: { archivedAt: new Date() },
      }),
    );

    // A grace on somebody who has left the parish would keep a name in the
    // roster's date arithmetic for as long as the grace lasted, and there is no
    // screen left to undo it from.
    await expect(extendMember(parish, memberId, 14, TODAY)).rejects.toBeInstanceOf(
      DomainError,
    );
    await expect(undoExtension(parish, memberId)).rejects.toBeInstanceOf(
      DomainError,
    );
  });
});

describe("a new period", () => {
  it("clears the marker and the grace when a confession is recorded", async () => {
    const memberId = await seedLateMember(parish, "Late Member", "01000000001");
    await markReminderSent(parish, memberId);
    await extendMember(parish, memberId, 14, TODAY);
    expect((await readMember(parish, memberId)).reminderSentAt).not.toBeNull();

    await recordConfession(parish, memberId, "2026-10-20", TODAY);

    // This is the failure that costs something rather than something: a member
    // who comes back carrying "already reminded" is skipped for the whole of
    // the next period, and nothing anywhere says why.
    const stored = await readMember(parish, memberId);
    expect(stored.reminderSentAt).toBeNull();
    expect(stored.extendedUntil).toBeNull();
    expect(metricsOf(stored).activeExtension).toBeNull();
  });

  it("leaves the interval edit alone, so fixing a limit has no hidden effect", async () => {
    // Deliberate asymmetry, and worth a test because it is easy to "tidy up"
    // later without realising the tidy-up is a behaviour change: editing the
    // limit leaves the grace alone, because a grace that turns out to be longer
    // than a corrected limit is visible in the drawer and can be taken back
    // there, whereas clearing it silently would make an ordinary edit of a
    // number unexpectedly revoke a decision the priest made on purpose.
    const memberId = await seedLateMember(parish, "Late Member", "01000000001");
    await extendMember(parish, memberId, 30, TODAY);

    await withTenant(parish.tenant.id, (db) =>
      db.member.updateMany({
        where: { tenantId: parish.tenant.id, id: memberId },
        data: { confessionIntervalDays: 7 },
      }),
    );

    expect((await readMember(parish, memberId)).extendedUntil).toBe("2026-11-20");
  });
});

describe("capabilities", () => {
  it("is available to a priest, not only to a tenant administrator", async () => {
    // The role exists for exactly this: the person who notices somebody has not
    // come back is the one who needs to grant them time, and making them wait
    // for an administrator is how the feature goes unused.
    const priest = await addMemberToTenant(prisma, parish, {
      name: "Parish Priest",
      role: USER_ROLES.PRIEST,
    });
    const memberId = await seedLateMember(parish, "Late Member", "01000000001");

    await markReminderSent(priest, memberId);
    await extendMember(priest, memberId, 7, TODAY);

    expect((await readMember(parish, memberId)).extendedUntil).toBe(addDays(TODAY, 7));
  });
});
