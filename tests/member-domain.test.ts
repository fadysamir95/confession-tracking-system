import { describe, expect, it } from "vitest";
import { STATUS } from "@/lib/constants";
import {
  addDays,
  differenceInCalendarDays,
  formatDate,
  getTodayInTimeZone,
  startOfWeek,
} from "@/lib/dates";
import { calculateMemberMetrics, toMemberListItem } from "@/lib/member-domain";

const settings = {
  defaultIntervalDays: 30,
  dueSoonThresholdDays: 7,
};

describe("date-only calculations", () => {
  it("handles leap day and month boundaries", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-02-29", 1)).toBe("2024-03-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("calculates signed calendar-day differences", () => {
    expect(differenceInCalendarDays("2026-09-25", "2026-09-15")).toBe(10);
    expect(differenceInCalendarDays("2026-09-15", "2026-09-25")).toBe(-10);
    expect(differenceInCalendarDays("2026-09-15", "2026-09-15")).toBe(0);
  });

  it("gets today in the configured timezone", () => {
    const instant = new Date("2026-09-25T23:30:00.000Z");
    expect(getTodayInTimeZone("Africa/Cairo", instant)).toBe("2026-09-26");
    expect(getTodayInTimeZone("UTC", instant)).toBe("2026-09-25");
  });

  it("starts weeks on Monday", () => {
    expect(startOfWeek("2026-09-27")).toBe("2026-09-21");
    expect(startOfWeek("2026-09-21")).toBe("2026-09-21");
  });

  it("formats dates consistently without local-time conversion", () => {
    expect(formatDate("2026-09-25", "DD/MM/YYYY", "en")).toBe("25/09/2026");
    // "Sept", not "Sep": `intlLocale("en")` is `en-GB`, so the month names that
    // come back are the British ones. The four-letter abbreviation is deliberate
    // and consistent — it is the form a Coptic priest writing a September
    // register in Britain would use.
    expect(formatDate("2026-09-25", "D MMM YYYY", "en")).toBe("25 Sept 2026");
    expect(formatDate(null, "DD/MM/YYYY", "en", "No record")).toBe("No record");
  });

  it("names the month in the reader's language while keeping the digits Latin", () => {
    // Arabic is the default, so this is what a priest with no cookie set sees.
    // The month is named in Arabic; the digits stay Latin, because a date the
    // priest is going to copy into a paper register has to look the way he
    // writes it. That split is deliberate and is the reason `intlLocale("ar")`
    // carries a `-u-nu-latn` extension rather than being the bare tag "ar".
    expect(formatDate("2026-09-25", "D MMM YYYY", "ar")).toBe("25 سبتمبر 2026");
    // The numeric format is digits only, so the two locales agree exactly.
    expect(formatDate("2026-09-25", "DD/MM/YYYY", "ar")).toBe("25/09/2026");
  });
});

describe("confession status", () => {
  it("returns never recorded when no date exists", () => {
    const result = calculateMemberMetrics(
      { lastConfessionDate: null, confessionIntervalDays: null },
      settings,
      "2026-09-25",
    );
    expect(result.status).toBe(STATUS.NEVER_RECORDED);
    expect(result.nextDueDate).toBeNull();
  });

  it("uses active outside the due-soon threshold", () => {
    const result = calculateMemberMetrics(
      { lastConfessionDate: "2026-09-03", confessionIntervalDays: 30 },
      settings,
      "2026-09-25",
    );
    expect(result.status).toBe(STATUS.ACTIVE);
    expect(result.daysRemaining).toBe(8);
  });

  it("uses due soon at the inclusive threshold", () => {
    const result = calculateMemberMetrics(
      { lastConfessionDate: "2026-09-02", confessionIntervalDays: 30 },
      settings,
      "2026-09-25",
    );
    expect(result.status).toBe(STATUS.DUE_SOON);
    expect(result.daysRemaining).toBe(7);
  });

  it("uses overdue on and after the due date", () => {
    const due = calculateMemberMetrics(
      { lastConfessionDate: "2026-08-26", confessionIntervalDays: 30 },
      settings,
      "2026-09-25",
    );
    const late = calculateMemberMetrics(
      { lastConfessionDate: "2026-08-06", confessionIntervalDays: 30 },
      settings,
      "2026-09-25",
    );
    expect(due.status).toBe(STATUS.OVERDUE);
    expect(due.daysRemaining).toBe(0);
    expect(late.status).toBe(STATUS.OVERDUE);
    expect(late.daysOverdue).toBe(20);
  });

  it("honors custom intervals and the system default", () => {
    const custom = calculateMemberMetrics(
      { lastConfessionDate: "2026-09-01", confessionIntervalDays: 45 },
      settings,
      "2026-09-25",
    );
    const fallback = calculateMemberMetrics(
      { lastConfessionDate: "2026-09-01", confessionIntervalDays: null },
      settings,
      "2026-09-25",
    );
    expect(custom.nextDueDate).toBe("2026-10-16");
    expect(custom.daysRemaining).toBe(21);
    expect(fallback.nextDueDate).toBe("2026-10-01");
    expect(fallback.daysRemaining).toBe(6);
    expect(fallback.status).toBe(STATUS.DUE_SOON);
  });
});

/**
 * A duration extension, as a floor on the due date.
 *
 * The behaviour a priest depends on is that granting time takes somebody off the
 * past-the-limit list and that the limit then applies again by itself when the
 * time runs out. That second half is the one that is easy to get wrong, because
 * the naive implementation — store the extra days and subtract them as they are
 * consumed — needs something to decrement them, and something that does not run
 * is something that quietly leaves the member forgiven forever. So every case
 * below is about the *expiry* being automatic, and the tests are written to fail
 * if a grace that has run out still counts for anything.
 */
describe("duration extension", () => {
  /** Due 2026-10-01 on a 30-day interval, so 20 days past it by the 21st. */
  const overdue = (extendedUntil: string | null, today: string) =>
    calculateMemberMetrics(
      { lastConfessionDate: "2026-09-01", confessionIntervalDays: 30, extendedUntil },
      settings,
      today,
    );

  it("takes a member off the past-the-limit list", () => {
    const before = overdue(null, "2026-10-21");
    expect(before.status).toBe(STATUS.OVERDUE);
    expect(before.daysOverdue).toBe(20);

    // Fourteen days clears the nearing-limit band as well, so this is the case
    // where the member leaves the attention section altogether. Seven days does
    // not — see the last test in this block.
    const after = overdue("2026-11-04", "2026-10-21");
    expect(after.status).toBe(STATUS.ACTIVE);
    expect(after.daysOverdue).toBe(0);
    expect(after.daysRemaining).toBe(14);
  });

  it("returns them to the list the moment the time runs out, with nothing to do", () => {
    // The same extension, read the day before it ends and the day after. No
    // write happens between these two calls — which is the point: the grace
    // expires on its own, so nobody has to remember to remove it.
    const lastDay = overdue("2026-10-28", "2026-10-27");
    const firstDayLate = overdue("2026-10-28", "2026-10-29");

    expect(lastDay.status).toBe(STATUS.DUE_SOON);
    expect(lastDay.activeExtension).toBe("2026-10-28");

    expect(firstDayLate.status).toBe(STATUS.OVERDUE);
    expect(firstDayLate.activeExtension).toBeNull();
    // One day past the *graced* date, not twenty-eight past the original limit.
    // The extension moved the deadline, so when it lapses that moved deadline is
    // what they are held to — which is the whole point of storing a date.
    expect(firstDayLate.daysOverdue).toBe(1);
  });

  it("stops reporting a grace that has run out as one in force", () => {
    // Offering to "take back" an extension that has expired would be offering
    // to undo something that is no longer holding anybody back, and the priest
    // would have to work out that pressing it changes nothing.
    const expired = overdue("2026-10-01", "2026-10-21");
    expect(expired.activeExtension).toBeNull();
  });

  it("cannot pull a due date earlier, only later", () => {
    // The whole reason this is a floor and not an override. A grace earlier than
    // the limit, or already in the past, must leave the date alone — otherwise a
    // member just cleared from the list would reappear in it the moment the
    // priest pressed the button, and the control would read as having made
    // things worse.
    const beforeTheLimit = overdue("2026-09-15", "2026-10-21");
    expect(beforeTheLimit.nextDueDate).toBe("2026-10-01");
    expect(beforeTheLimit.status).toBe(STATUS.OVERDUE);

    const inThePast = overdue("2026-09-01", "2026-10-21");
    expect(inThePast.nextDueDate).toBe("2026-10-01");
  });

  it("lands on the limit itself rather than past it", () => {
    // An extension set to exactly the limit date adds nothing, so the original
    // is kept. Equal dates are not "later", and treating them as later would
    // make the stored value look like it had done something when it had not.
    const exact = overdue("2026-10-01", "2026-10-21");
    expect(exact.nextDueDate).toBe("2026-10-01");
  });

  it("leaves a member with no record on record", () => {
    // There is no period to extend, so there is nothing to push back. If this
    // ever started reporting an extension for a member who has never confessed,
    // the "never recorded" queue would start growing its own hidden filter.
    const metrics = calculateMemberMetrics(
      { lastConfessionDate: null, confessionIntervalDays: null, extendedUntil: "2026-12-01" },
      settings,
      "2026-10-21",
    );
    expect(metrics.status).toBe(STATUS.NEVER_RECORDED);
    expect(metrics.nextDueDate).toBeNull();
    expect(metrics.activeExtension).toBeNull();
  });

  it("can land a member inside the nearing-limit band rather than past it", () => {
    // Worth pinning because it is the case a priest is most likely to create by
    // accident: seven days' grace on somebody already deep in the overdue
    // column lands them in the queue immediately below, not in the clear.
    const seven = overdue("2026-10-28", "2026-10-21");
    expect(seven.daysRemaining).toBe(7);
    expect(seven.status).toBe(STATUS.DUE_SOON);
  });
});

/**
 * The reminder marker, as a value the interface can be wrong about.
 *
 * `reminderSentOn` is a date in the parish's own timezone, not a timestamp. Read
 * in UTC it would say the reminder went out on the previous day for every parish
 * east of Greenwich, and on the same day for every parish west of it — and a
 * marker that is off by a day is worse than no marker, because it looks like a
 * fact.
 */
describe("reminder marker", () => {
  it("reports the tenant's day, not UTC's", () => {
    // 23:30 UTC is already the next day in Cairo and already the previous day in
    // Los Angeles, so one instant gives three different answers.
    const sentAt = new Date("2026-10-21T23:30:00.000Z");

    const cairo = toMemberListItem(
      { id: "m1", name: "A", phone: null, lastConfessionDate: "2026-09-01", confessionIntervalDays: 30, reminderSentAt: sentAt },
      settings,
      "2026-10-21",
      "Africa/Cairo",
    );
    const losAngeles = toMemberListItem(
      { id: "m2", name: "B", phone: null, lastConfessionDate: "2026-09-01", confessionIntervalDays: 30, reminderSentAt: sentAt },
      settings,
      "2026-10-21",
      "America/Los_Angeles",
    );

    expect(cairo.reminderSentOn).toBe("2026-10-22");
    expect(losAngeles.reminderSentOn).toBe("2026-10-21");
  });

  it("is null for a member who has never been reminded", () => {
    const member = toMemberListItem(
      { id: "m3", name: "C", phone: null, lastConfessionDate: "2026-09-01", confessionIntervalDays: 30 },
      settings,
      "2026-10-21",
      "Africa/Cairo",
    );
    expect(member.reminderSentOn).toBeNull();
  });

  it("does not leak the raw timestamp into what the browser receives", () => {
    // The list item is serialized into the page for hydration, so a field that
    // came along for the ride would be shipped to every reader of the roster.
    const member = toMemberListItem(
      { id: "m4", name: "D", phone: null, lastConfessionDate: "2026-09-01", confessionIntervalDays: 30, reminderSentAt: new Date("2026-10-20T09:00:00.000Z") },
      settings,
      "2026-10-21",
      "Africa/Cairo",
    );
    expect(Object.keys(member)).not.toContain("reminderSentAt");
    expect(Object.keys(member)).not.toContain("extendedUntil");
  });
});
