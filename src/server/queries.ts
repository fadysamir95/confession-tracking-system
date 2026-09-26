import "server-only";
import { CAPABILITIES, STATUS, type MemberStatus } from "@/lib/constants";
import { getTodayInTimeZone, startOfMonth, startOfWeek } from "@/lib/dates";
import { getRequestDictionary, getRequestLocale } from "@/lib/i18n-server";
import { toMemberListItem } from "@/lib/member-domain";
import { sortMembers } from "@/lib/member-filters";
import {
  buildWhatsAppContactUrl,
  buildWhatsAppReminderUrl,
  shouldOfferReminder,
} from "@/lib/whatsapp";
import { canAccess, requireCapability, type TenantContext } from "@/server/auth";
import { withTenant } from "@/server/db";
import { getSettings } from "@/server/settings";

/**
 * The locale of the request being answered, read from the same cookie the root
 * layout read. The alternative — threading it through every call site — would
 * spread a presentation concern across the data layer, and the two reads cannot
 * disagree because they read one value.
 */
async function requestLocale() {
  const locale = await getRequestLocale();
  return { locale, dict: await getRequestDictionary() };
}

const memberSelect = {
  id: true,
  name: true,
  phone: true,
  lastConfessionDate: true,
  confessionIntervalDays: true,
} as const;

export interface DashboardMember extends ReturnType<typeof toMemberListItem> {
  /** With the saved reminder prefilled. See `lib/member-view-types`. */
  reminderUrl: string | null;
  /** A bare chat link, nothing prefilled. */
  whatsappUrl: string | null;
}

export interface DashboardData {
  settings: Awaited<ReturnType<typeof getSettings>>;
  today: string;
  canManageLifecycle: boolean;
  members: DashboardMember[];
  stats: {
    total: number;
    active: number;
    dueSoon: number;
    overdue: number;
    neverRecorded: number;
    noPhone: number;
    confessionsThisMonth: number;
    confessionsThisWeek: number;
  };
  attention: {
    overdue: DashboardMember[];
    dueSoon: DashboardMember[];
    neverRecorded: DashboardMember[];
  };
  recent: Array<{
    memberId: string;
    name: string;
    confessionDate: string;
  }>;
}

type Locale = Awaited<ReturnType<typeof requestLocale>>;

function addWhatsAppUrl(
  member: ReturnType<typeof toMemberListItem>,
  settings: { whatsappTemplate: string; whatsappCountryCode: string; dateFormat: string },
  { locale, dict }: Locale,
): DashboardMember {
  const reminderUrl = buildWhatsAppReminderUrl(member, {
    template: settings.whatsappTemplate,
    countryCode: settings.whatsappCountryCode,
    dateFormat: settings.dateFormat as Parameters<typeof buildWhatsAppReminderUrl>[1]["dateFormat"],
    locale,
    dict,
  });

  return {
    ...member,
    // Decided here, and here alone. The saved message states how many days late
    // the member is, so for anyone who is not late it would put the parish's own
    // wording — carrying this member's name — into the page behind a control that
    // must never be pressed. Deciding in the query rather than in the three
    // components that render these links means the link is simply absent, the
    // page carries nothing it should not, and there is no second place to
    // forget the rule. `reminderUrl: null` now means exactly "not to be reminded".
    reminderUrl: shouldOfferReminder(member.status, reminderUrl) ? reminderUrl : null,
    // The bare link carries no message and so is offered to anyone with a number.
    whatsappUrl: buildWhatsAppContactUrl(member, {
      countryCode: settings.whatsappCountryCode,
    }),
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  const context = await requireCapability(CAPABILITIES.MANAGE_MEMBERS);
  const tenantId = context.tenant.id;
  const request = await requestLocale();
  const settings = await getSettings(tenantId, request.locale);
  const today = getTodayInTimeZone(settings.timezone);
  const monthStart = startOfMonth(today);
  const weekStart = startOfWeek(today);

  const { sourceMembers, periodRecords, recentRecords } = await withTenant(
    tenantId,
    async (db) => {
      const [members, period, recent] = await Promise.all([
        db.member.findMany({
          where: { tenantId, archivedAt: null },
          select: memberSelect,
          orderBy: { name: "asc" },
        }),
        db.confessionRecord.findMany({
          where: {
            tenantId,
            confessionDate: { gte: monthStart },
            member: { archivedAt: null },
          },
          select: { confessionDate: true },
        }),
        db.confessionRecord.findMany({
          where: { tenantId, member: { archivedAt: null } },
          orderBy: [{ createdAt: "desc" }, { confessionDate: "desc" }],
          take: 6,
          select: {
            memberId: true,
            confessionDate: true,
            member: { select: { name: true } },
          },
        }),
      ]);
      return { sourceMembers: members, periodRecords: period, recentRecords: recent };
    },
  );

  const members = sourceMembers.map((member) =>
    addWhatsAppUrl(toMemberListItem(member, settings, today), settings, request),
  );

  const countStatus = (status: MemberStatus) =>
    members.filter((member) => member.status === status).length;

  // Sorted under the reader's collation rules: Arabic names do not sort the way
  // Latin ones do, and an alphabetised roster that is not actually alphabetised
  // is worse than one with no order at all.
  const attentionSorted = sortMembers(members, "ATTENTION", request.locale);
  const byStatus = (status: MemberStatus) =>
    attentionSorted.filter((member) => member.status === status);

  return {
    settings,
    today,
    canManageLifecycle: canAccess(context, CAPABILITIES.MANAGE_MEMBERS),
    members,
    stats: {
      total: members.length,
      active: countStatus(STATUS.ACTIVE),
      dueSoon: countStatus(STATUS.DUE_SOON),
      overdue: countStatus(STATUS.OVERDUE),
      neverRecorded: countStatus(STATUS.NEVER_RECORDED),
      noPhone: members.filter((member) => !member.phone).length,
      confessionsThisMonth: periodRecords.filter(
        (record) => record.confessionDate >= monthStart,
      ).length,
      confessionsThisWeek: periodRecords.filter(
        (record) => record.confessionDate >= weekStart,
      ).length,
    },
    attention: {
      overdue: byStatus(STATUS.OVERDUE).slice(0, 6),
      dueSoon: byStatus(STATUS.DUE_SOON).slice(0, 6),
      neverRecorded: byStatus(STATUS.NEVER_RECORDED).slice(0, 6),
    },
    recent: recentRecords.map((record) => ({
      memberId: record.memberId,
      name: record.member.name,
      confessionDate: record.confessionDate,
    })),
  };
}

/**
 * Loads one member for the current tenant.
 *
 * Returns null when the id does not exist *and* when it belongs to another
 * tenant. The two cases are deliberately indistinguishable, because telling
 * them apart would confirm the existence of a record the caller is not allowed
 * to know about. The Row-Level Security policy guarantees the second case even
 * though the explicit tenantId filter is what is written here.
 */
export async function getMemberDetails(context: TenantContext, memberId: string) {
  const tenantId = context.tenant.id;
  const request = await requestLocale();
  const settings = await getSettings(tenantId, request.locale);
  const today = getTodayInTimeZone(settings.timezone);

  const member = await withTenant(tenantId, (db) =>
    db.member.findFirst({
      where: { tenantId, id: memberId, archivedAt: null },
      select: {
        ...memberSelect,
        administrativeNote: true,
        records: {
          orderBy: { confessionDate: "desc" },
          select: { id: true, confessionDate: true, createdAt: true },
        },
      },
    }),
  );

  if (!member) return null;

  const metricsMember = toMemberListItem(member, settings, today);
  // The same rule as the dashboard's, and for the same reason: this is the
  // drawer, so it is the surface most likely to be handed to a visitor at the
  // church door, and a saved message here would be one press from leaving with
  // somebody's parish's wording in it.
  const reminderUrl = buildWhatsAppReminderUrl(metricsMember, {
    template: settings.whatsappTemplate,
    countryCode: settings.whatsappCountryCode,
    dateFormat: settings.dateFormat,
    locale: request.locale,
    dict: request.dict,
  });
  return {
    ...metricsMember,
    administrativeNote: member.administrativeNote,
    reminderUrl: shouldOfferReminder(metricsMember.status, reminderUrl)
      ? reminderUrl
      : null,
    whatsappUrl: buildWhatsAppContactUrl(metricsMember, {
      countryCode: settings.whatsappCountryCode,
    }),
    history: member.records.map((record) => ({
      id: record.id,
      confessionDate: record.confessionDate,
      recordedAt: record.createdAt.toISOString(),
    })),
    dateFormat: settings.dateFormat,
    today,
  };
}

export async function getArchivedMembers() {
  const context = await requireCapability(CAPABILITIES.MANAGE_MEMBERS);
  const tenantId = context.tenant.id;
  const locale = await getRequestLocale();
  const settings = await getSettings(tenantId, locale);
  const today = getTodayInTimeZone(settings.timezone);

  const members = await withTenant(tenantId, (db) =>
    db.member.findMany({
      where: { tenantId, archivedAt: { not: null } },
      select: {
        ...memberSelect,
        archivedAt: true,
      },
      orderBy: { archivedAt: "desc" },
    }),
  );

  return members.map((member) => ({
    ...toMemberListItem(member, settings, today),
    archivedAt: member.archivedAt?.toISOString() ?? null,
  }));
}

export async function getRecentAuditLogs() {
  const context = await requireCapability(CAPABILITIES.VIEW_AUDIT);
  const tenantId = context.tenant.id;

  return withTenant(tenantId, (db) =>
    db.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        action: true,
        memberId: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    }),
  );
}
