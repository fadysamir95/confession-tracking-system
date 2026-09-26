import { STATUS, type MemberStatus } from "@/lib/constants";
import type { MemberListItem } from "@/lib/member-domain";
import { intlLocale, type Locale } from "@/lib/i18n";
import type { Dictionary } from "@/lib/dictionaries/en";

export const MEMBER_FILTERS = [
  "ALL",
  "ACTIVE",
  "DUE_SOON",
  "OVERDUE",
  "NEVER_RECORDED",
  "NO_PHONE",
] as const;

/**
 * Turn a `?filter=` query value into a filter, or "all" if it is not one.
 *
 * This lives here rather than beside the filter state because the dashboard page
 * needs it on the server, and a function exported from a `"use client"` module
 * cannot be *called* from a server component — only rendered. It is pure logic
 * with no React in it, which is exactly what this module is for.
 *
 * An unrecognised value falls back to "all" rather than erroring. The parameter
 * is in the URL, which means it is user-editable, shareable, and outlives any
 * bookmark that was saved against an older build. It selects a view; it grants
 * nothing, so a stale one is a view that does not exist rather than a problem.
 */
export function parseMemberFilter(value?: string | string[]): MemberFilter {
  const candidate = Array.isArray(value) ? value[0] : value;
  return MEMBER_FILTERS.includes(candidate as MemberFilter)
    ? (candidate as MemberFilter)
    : "ALL";
}

export type MemberFilter = (typeof MEMBER_FILTERS)[number];

/**
 * The orders the roster can be read in.
 *
 * There is deliberately no "by days since" order. Days since is the same
 * quantity as days remaining expressed against a different constant, so it
 * duplicated `DUE_LATEST` for everyone whose limit is the parish default while
 * disagreeing with it for everyone on a custom one — two controls, one of them
 * subtly wrong. Sorting by status, then by days remaining, is the same ordering
 * without the trap, which is what `ATTENTION` does.
 */
export const MEMBER_SORTS = [
  "ATTENTION",
  "NAME_ASC",
  "NAME_DESC",
  "LAST_NEWEST",
  "LAST_OLDEST",
  "DUE_SOONEST",
  "DUE_LATEST",
  "STATUS",
] as const;

export type MemberSort = (typeof MEMBER_SORTS)[number];

/**
 * Filter labels come from the dictionary rather than living here, so the same
 * phrase is written once. `filters.active` deliberately does not reuse
 * `status.ACTIVE`: they are both "Active" in English, but a filter chip naming a
 * group is not the same thing as the badge on a row, and Arabic keeps them
 * distinguishable.
 */
export function filterLabel(filter: MemberFilter, dict: Dictionary): string {
  switch (filter) {
    case "ALL":
      return dict.filters.all;
    case "ACTIVE":
      return dict.filters.active;
    case "DUE_SOON":
      return dict.filters.dueSoon;
    case "OVERDUE":
      return dict.filters.overdue;
    case "NEVER_RECORDED":
      return dict.filters.neverConfessed;
    case "NO_PHONE":
      return dict.filters.noPhone;
  }
}

export function sortLabel(sort: MemberSort, dict: Dictionary): string {
  switch (sort) {
    case "ATTENTION":
      return dict.members.sortOptions.attention;
    case "NAME_ASC":
      return dict.members.sortOptions.nameAsc;
    case "NAME_DESC":
      return dict.members.sortOptions.nameDesc;
    case "LAST_NEWEST":
      return dict.members.sortOptions.lastDesc;
    case "LAST_OLDEST":
      return dict.members.sortOptions.lastAsc;
    case "DUE_SOONEST":
      return dict.members.sortOptions.dueAsc;
    case "DUE_LATEST":
      return dict.members.sortOptions.dueDesc;
    case "STATUS":
      return dict.members.sortOptions.status;
  }
}

const STATUS_RANK: Record<MemberStatus, number> = {
  OVERDUE: 0,
  DUE_SOON: 1,
  NEVER_RECORDED: 2,
  ACTIVE: 3,
};

/**
 * Search folding has to follow the reader's language, not the machine's.
 * Arabic has no upper- and lowercase distinction but does have its own
 * normalisation requirements, and defaulting to the host locale would make the
 * same roster searchable for one priest and not for another.
 */
function normalizedSearch(value: string, locale: Locale): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase(intlLocale(locale));
}

export function searchMembers<T extends MemberListItem>(
  members: T[],
  query: string,
  locale: Locale = "ar",
): T[] {
  const needle = normalizedSearch(query, locale);

  if (!needle) {
    return members;
  }

  const digits = needle.replace(/\D/g, "");
  return members.filter((member) => {
    const nameMatches = normalizedSearch(member.name, locale).includes(needle);
    const phoneMatches = digits.length > 0 && Boolean(member.phone?.replace(/\D/g, "").includes(digits));
    return nameMatches || phoneMatches;
  });
}

export function filterMembers<T extends MemberListItem>(
  members: T[],
  filter: MemberFilter,
): T[] {
  if (filter === "ALL") {
    return members;
  }

  if (filter === "NO_PHONE") {
    return members.filter((member) => !member.phone);
  }

  return members.filter((member) => member.status === filter);
}

function compareNullableDates(
  left: string | null,
  right: string | null,
  direction: "asc" | "desc",
): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const result = left.localeCompare(right);
  return direction === "asc" ? result : -result;
}

function compareNumbers(
  left: number | null,
  right: number | null,
  direction: "asc" | "desc",
): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return direction === "asc" ? left - right : right - left;
}

function byName(left: MemberListItem, right: MemberListItem, locale: Locale): number {
  // Arabic sorts by collation order, not by code point, so "محمد" and "محمود"
  // land next to each other instead of at opposite ends of the alphabet.
  return left.name.localeCompare(right.name, intlLocale(locale), {
    sensitivity: "base",
  });
}

export function sortMembers<T extends MemberListItem>(
  members: T[],
  sort: MemberSort,
  locale: Locale = "ar",
): T[] {
  return [...members].sort((left, right) => {
    switch (sort) {
      case "NAME_ASC":
        return byName(left, right, locale);
      case "NAME_DESC":
        return byName(right, left, locale);
      case "LAST_NEWEST":
        return compareNullableDates(
          left.lastConfessionDate,
          right.lastConfessionDate,
          "desc",
        );
      case "LAST_OLDEST":
        return compareNullableDates(
          left.lastConfessionDate,
          right.lastConfessionDate,
          "asc",
        );
      case "DUE_SOONEST":
        return compareNumbers(left.daysRemaining, right.daysRemaining, "asc");
      case "DUE_LATEST":
        return compareNumbers(left.daysRemaining, right.daysRemaining, "desc");
      case "STATUS":
        return (
          STATUS_RANK[left.status] - STATUS_RANK[right.status] ||
          byName(left, right, locale)
        );
      case "ATTENTION":
      default:
        return (
          STATUS_RANK[left.status] - STATUS_RANK[right.status] ||
          compareNumbers(left.daysRemaining, right.daysRemaining, "asc") ||
          compareNullableDates(
            left.lastConfessionDate,
            right.lastConfessionDate,
            "asc",
          ) ||
          byName(left, right, locale)
        );
    }
  });
}

export function getMemberCounts(members: MemberListItem[]) {
  return members.reduce(
    (counts, member) => {
      counts.total += 1;
      if (member.status === STATUS.ACTIVE) counts.active += 1;
      if (member.status === STATUS.DUE_SOON) counts.dueSoon += 1;
      if (member.status === STATUS.OVERDUE) counts.overdue += 1;
      if (member.status === STATUS.NEVER_RECORDED) counts.neverRecorded += 1;
      if (!member.phone) counts.noPhone += 1;
      return counts;
    },
    {
      total: 0,
      active: 0,
      dueSoon: 0,
      overdue: 0,
      neverRecorded: 0,
      noPhone: 0,
    },
  );
}
