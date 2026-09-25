import { describe, expect, it } from "vitest";
import { STATUS } from "@/lib/constants";
import { toMemberListItem } from "@/lib/member-domain";
import {
  filterMembers,
  getMemberCounts,
  searchMembers,
  sortMembers,
} from "@/lib/member-filters";

const settings = {
  defaultIntervalDays: 30,
  dueSoonThresholdDays: 7,
};
const today = "2026-09-25";

const members = [
  {
    id: "1",
    name: "John Doe",
    phone: "+20 100 123 4567",
    lastConfessionDate: "2026-08-10",
    confessionIntervalDays: 30,
  },
  {
    id: "2",
    name: "Peter John",
    phone: null,
    lastConfessionDate: "2026-09-22",
    confessionIntervalDays: 10,
  },
  {
    id: "3",
    name: "Mark Smith",
    phone: "01099998888",
    lastConfessionDate: null,
    confessionIntervalDays: null,
  },
  {
    id: "4",
    name: "Ámira Khalil",
    phone: null,
    lastConfessionDate: "2026-09-10",
    confessionIntervalDays: 30,
  },
].map((member) => toMemberListItem(member, settings, today));

describe("member search, filter, and sort", () => {
  it("searches names without case or diacritic sensitivity", () => {
    expect(searchMembers(members, "amira").map((member) => member.id)).toEqual(["4"]);
    expect(searchMembers(members, "010 9999").map((member) => member.id)).toEqual(["3"]);
  });

  it("combines search and status filters", () => {
    const result = filterMembers(
      searchMembers(members, "john"),
      "OVERDUE",
    );
    expect(result.map((member) => member.name)).toEqual(["John Doe"]);
  });

  it("filters members without phone numbers", () => {
    expect(filterMembers(members, "NO_PHONE").map((member) => member.id)).toEqual([
      "2",
      "4",
    ]);
  });

  it("prioritizes the most overdue member by default", () => {
    const sorted = sortMembers(members, "ATTENTION");
    expect(sorted.map((member) => member.status)).toEqual([
      STATUS.OVERDUE,
      STATUS.DUE_SOON,
      STATUS.NEVER_RECORDED,
      STATUS.ACTIVE,
    ]);
    expect(sorted[0]?.id).toBe("1");
  });

  it("sorts names in both directions", () => {
    expect(sortMembers(members, "NAME_ASC")[0]?.name).toBe("Ámira Khalil");
    expect(sortMembers(members, "NAME_DESC")[0]?.name).toBe("Peter John");
  });

  it("returns accurate dashboard counts", () => {
    expect(getMemberCounts(members)).toEqual({
      total: 4,
      active: 1,
      dueSoon: 1,
      overdue: 1,
      neverRecorded: 1,
      noPhone: 2,
    });
  });
});
