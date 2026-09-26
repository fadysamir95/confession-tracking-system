import { STATUS, type MemberStatus } from "@/lib/constants";
import {
  addDays,
  differenceInCalendarDays,
  getTodayInTimeZone,
  toIsoDate,
} from "@/lib/dates";

export interface MemberStatusInput {
  lastConfessionDate: string | null;
  confessionIntervalDays: number | null;
  /**
   * A grace deadline the priest set, or `null` for none.
   *
   * Optional rather than required so that every existing caller — and every
   * existing test — keeps describing a member who has never been given one,
   * rather than having to spell out `null` at each of them.
   */
  extendedUntil?: string | null;
}

export interface MemberMetrics {
  effectiveIntervalDays: number;
  status: MemberStatus;
  nextDueDate: string | null;
  daysSinceLastConfession: number | null;
  daysRemaining: number | null;
  daysOverdue: number;
  /**
   * The grace the priest gave, in force right now.
   *
   * `null` when there is none, or when the one on file has already passed — a
   * grace that is over is not a grace, and reporting it as one would invite
   * somebody to "undo" an extension that no longer affects anything.
   */
  activeExtension: string | null;
}

export interface MemberListItem extends MemberMetrics {
  id: string;
  name: string;
  phone: string | null;
  lastConfessionDate: string | null;
  hasCustomInterval: boolean;
  /**
   * The tenant's calendar day on which the reminder was last opened, or `null`.
   *
   * A date rather than a timestamp: it is only ever read as "on what day did I
   * already ask", and a full instant would mean shipping a time zone to the
   * browser to print a day the server already knows.
   */
  reminderSentOn: string | null;
}

export interface MemberSource {
  id: string;
  name: string;
  phone: string | null;
  lastConfessionDate: string | null;
  confessionIntervalDays: number | null;
  extendedUntil?: string | null;
  reminderSentAt?: Date | null;
}

export interface MemberSettingsInput {
  defaultIntervalDays: number;
  dueSoonThresholdDays: number;
}

export function getEffectiveIntervalDays(
  member: Pick<MemberSource, "confessionIntervalDays">,
  settings: MemberSettingsInput,
): number {
  return member.confessionIntervalDays ?? settings.defaultIntervalDays;
}

/**
 * The date the member is actually expected back by.
 *
 * A grace deadline is a *floor* on this date, never a replacement for it, and
 * the difference is the whole design. A replacement would let a grace that is
 * already past, or that is shorter than the limit itself, pull the date
 * backwards — and a member who had just been cleared from the overdue list
 * would reappear in it, which reads as a bug and is the one thing an extension
 * must never do. Taking the later of the two dates means an extension can only
 * ever help, and the moment it runs out the limit simply starts applying again
 * with nothing to undo.
 *
 * Both values are `YYYY-MM-DD`, fixed-width and zero-padded, so comparing them
 * as strings orders them as dates. That is why this is a `>` and not a
 * difference in days: it is the same comparison, without constructing two Dates
 * to answer it.
 */
function resolveNextDueDate(
  limitDate: string,
  extendedUntil: string | null | undefined,
): string {
  return extendedUntil && extendedUntil > limitDate ? extendedUntil : limitDate;
}

export function calculateMemberMetrics(
  member: MemberStatusInput,
  settings: MemberSettingsInput,
  today: string,
): MemberMetrics {
  const effectiveIntervalDays = getEffectiveIntervalDays(member, settings);

  if (!member.lastConfessionDate) {
    return {
      effectiveIntervalDays,
      status: STATUS.NEVER_RECORDED,
      nextDueDate: null,
      daysSinceLastConfession: null,
      daysRemaining: null,
      daysOverdue: 0,
      activeExtension: null,
    };
  }

  const limitDate = addDays(member.lastConfessionDate, effectiveIntervalDays);
  const nextDueDate = resolveNextDueDate(limitDate, member.extendedUntil);
  const daysSinceLastConfession = differenceInCalendarDays(
    today,
    member.lastConfessionDate,
  );
  const daysRemaining = differenceInCalendarDays(nextDueDate, today);
  const daysOverdue = Math.max(0, -daysRemaining);

  let status: MemberStatus;
  if (daysRemaining <= 0) {
    status = STATUS.OVERDUE;
  } else if (daysRemaining <= settings.dueSoonThresholdDays) {
    status = STATUS.DUE_SOON;
  } else {
    status = STATUS.ACTIVE;
  }

  return {
    effectiveIntervalDays,
    status,
    nextDueDate,
    daysSinceLastConfession,
    daysRemaining,
    daysOverdue,
    // In force only while it is still ahead of today. An extension that has run
    // out has stopped doing anything, and reporting it as active would offer to
    // undo an extension that is no longer holding the member back.
    activeExtension: nextDueDate > today ? member.extendedUntil ?? null : null,
  };
}

export function toMemberListItem(
  member: MemberSource,
  settings: MemberSettingsInput,
  today: string,
  timeZone?: string,
): MemberListItem {
  const { reminderSentAt, extendedUntil, ...source } = member;
  return {
    ...source,
    ...calculateMemberMetrics({ ...source, extendedUntil }, settings, today),
    hasCustomInterval: member.confessionIntervalDays !== null,
    reminderSentOn: reminderSentDate(reminderSentAt, timeZone),
  };
}

/**
 * The tenant's own calendar day for an instant.
 *
 * `reminderSentAt` is a real timestamp — the only such column on this table,
 * because every other date here is a calendar day — so it has to be placed in
 * the parish's timezone before it is shown or compared. Read in UTC it would say
 * a reminder was sent on the previous day for every parish east of Greenwich,
 * and on the same day but a different one for every parish west of it.
 *
 * The timezone is optional so that a caller with no settings to hand — a unit
 * test, a metric that never renders — is not forced to supply one it will not
 * use. A member with no reminder is `null` either way, which is the case that
 * actually matters for correctness.
 */
function reminderSentDate(sentAt: Date | null | undefined, timeZone?: string): string | null {
  if (!sentAt) return null;
  if (!timeZone) return toIsoDate(sentAt);
  return getTodayInTimeZone(timeZone, sentAt);
}

