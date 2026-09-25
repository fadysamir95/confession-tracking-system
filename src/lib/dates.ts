import { DEFAULT_LOCALE, intlLocale, type Locale } from "@/lib/i18n";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MILLISECONDS_PER_DAY = 86_400_000;

export type SupportedDateFormat = "DD/MM/YYYY" | "D MMM YYYY";

/**
 * `en` here is a fixed internal locale, not the user's. `getTodayInTimeZone`
 * has to read back the same `YYYY-MM-DD` it was asked for regardless of who is
 * looking, and `isValidTimeZone` only needs a formatter it can construct, not a
 * particular language. Only `formatDate`, which a person reads, takes a locale.
 */
const ISO_PARTS_LOCALE = "en";

function dateFromIso(value: string): Date {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new RangeError("Invalid ISO date");
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError("Invalid ISO date");
  }

  return date;
}

export function isValidIsoDate(value: string): boolean {
  try {
    dateFromIso(value);
    return true;
  } catch {
    return false;
  }
}

export function toIsoDate(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Invalid date");
  }

  return [
    date.getUTCFullYear().toString().padStart(4, "0"),
    (date.getUTCMonth() + 1).toString().padStart(2, "0"),
    date.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
}

export function addDays(value: string, days: number): string {
  if (!Number.isInteger(days)) {
    throw new RangeError("Days must be an integer");
  }

  const date = dateFromIso(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

export function differenceInCalendarDays(later: string, earlier: string): number {
  const laterTime = dateFromIso(later).getTime();
  const earlierTime = dateFromIso(earlier).getTime();
  return Math.round((laterTime - earlierTime) / MILLISECONDS_PER_DAY);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat(ISO_PARTS_LOCALE, { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function getTodayInTimeZone(
  timeZone: string,
  now: Date = new Date(),
): string {
  if (!isValidTimeZone(timeZone)) {
    throw new RangeError("Invalid timezone");
  }

  const parts = new Intl.DateTimeFormat(ISO_PARTS_LOCALE, {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;

  const year = value("year");
  const month = value("month");
  const day = value("day");

  if (!year || !month || !day) {
    throw new RangeError("Unable to calculate date");
  }

  return `${year}-${month}-${day}`;
}

/**
 * Renders a stored `YYYY-MM-DD` for a person to read.
 *
 * The stored string is a calendar date with no time and no zone, so it is
 * parsed and formatted in UTC throughout. Passing it through the local zone
 * would silently shift it by a day for anybody east or west of UTC, which on a
 * record of confessions is not a cosmetic bug.
 *
 * The month name follows the reader's language; the digits stay Latin in both,
 * because the roster is full of Latin-digit phone numbers and a split script is
 * harder to scan.
 */
export function formatDate(
  value: string | null | undefined,
  format: SupportedDateFormat,
  locale: Locale = DEFAULT_LOCALE,
  noRecordLabel: string = "",
): string {
  if (!value) {
    return noRecordLabel;
  }

  const date = dateFromIso(value);
  const day = date.getUTCDate();
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();

  if (format === "D MMM YYYY") {
    const monthName = new Intl.DateTimeFormat(intlLocale(locale), {
      month: "short",
      timeZone: "UTC",
    }).format(date);
    return `${day} ${monthName} ${year}`;
  }

  return `${day.toString().padStart(2, "0")}/${month
    .toString()
    .padStart(2, "0")}/${year}`;
}

/** Date and time together, for the audit trail and the session list. */
export function formatDateTime(
  isoValue: string,
  timeZone: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: isValidTimeZone(timeZone) ? timeZone : "UTC",
  }).format(new Date(isoValue));
}

/** Date alone, for places that show a day but not a time of day. */
export function formatPlainDate(
  isoValue: string,
  timeZone: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeZone: isValidTimeZone(timeZone) ? timeZone : "UTC",
  }).format(new Date(isoValue));
}

export function startOfMonth(value: string): string {
  const date = dateFromIso(value);
  return toIsoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
}

export function startOfWeek(value: string): string {
  const date = dateFromIso(value);
  const day = date.getUTCDay();
  const distanceToMonday = day === 0 ? 6 : day - 1;
  date.setUTCDate(date.getUTCDate() - distanceToMonday);
  return toIsoDate(date);
}

export function getSupportedTimeZones(): string[] {
  return typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : ["Africa/Cairo", "UTC"];
}
