import { STATUS, type MemberStatus } from "@/lib/constants";
import { addDays, differenceInCalendarDays } from "@/lib/dates";

export interface MemberStatusInput {
  lastConfessionDate: string | null;
  confessionIntervalDays: number | null;
}

export interface MemberMetrics {
  effectiveIntervalDays: number;
  status: MemberStatus;
  nextDueDate: string | null;
  daysSinceLastConfession: number | null;
  daysRemaining: number | null;
  daysOverdue: number;
}

export interface MemberListItem extends MemberMetrics {
  id: string;
  name: string;
  phone: string | null;
  lastConfessionDate: string | null;
  hasCustomInterval: boolean;
}

export interface MemberSource {
  id: string;
  name: string;
  phone: string | null;
  lastConfessionDate: string | null;
  confessionIntervalDays: number | null;
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
    };
  }

  const nextDueDate = addDays(member.lastConfessionDate, effectiveIntervalDays);
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
  };
}

export function toMemberListItem(
  member: MemberSource,
  settings: MemberSettingsInput,
  today: string,
): MemberListItem {
  return {
    ...member,
    ...calculateMemberMetrics(member, settings, today),
    hasCustomInterval: member.confessionIntervalDays !== null,
  };
}

