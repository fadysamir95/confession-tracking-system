import { describe, expect, it } from "vitest";
import { STATUS } from "@/lib/constants";
import {
  addDays,
  differenceInCalendarDays,
  formatDate,
  getTodayInTimeZone,
  startOfWeek,
} from "@/lib/dates";
import { calculateMemberMetrics } from "@/lib/member-domain";

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
