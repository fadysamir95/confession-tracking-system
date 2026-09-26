export const APP_NAME = "Confession Attendance";

/**
 * Roles describe what a person may do *inside one tenant*, and they live on
 * TenantMembership rather than on User. A user is a global identity; the
 * membership is the authorization record. That split is what lets the same
 * person later belong to two churches without a schema redesign, and it is why
 * there is deliberately no `role` column on User.
 *
 * The set is intentionally small. Two roles cover the described product, and
 * adding a third before it is needed would be speculative.
 */
export const USER_ROLES = {
  /** Full control of their own tenant's members, records and settings. */
  PRIEST: "PRIEST",
  /** Everything a priest can do, plus managing who else may enter the tenant. */
  TENANT_ADMIN: "TENANT_ADMIN",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export function isUserRole(value: string): value is UserRole {
  return Object.values(USER_ROLES).includes(value as UserRole);
}

export function isTenantAdminRole(role: string): boolean {
  return role === USER_ROLES.TENANT_ADMIN;
}

/**
 * Capabilities, expressed once. Call sites ask what they need rather than
 * comparing role strings, so a later role change is a one-line edit here
 * instead of an audit of every `if` in the codebase.
 */
export const CAPABILITIES = {
  /** View, add, edit, archive and record attendance for tenant members. */
  MANAGE_MEMBERS: "MANAGE_MEMBERS",
  /** Permanently delete a member. Reserved for the tenant administrator. */
  DELETE_MEMBERS: "DELETE_MEMBERS",
  /** Read and change this tenant's own settings. */
  MANAGE_SETTINGS: "MANAGE_SETTINGS",
  /** Read the tenant's audit trail. */
  VIEW_AUDIT: "VIEW_AUDIT",
  /** Export the tenant's data. */
  EXPORT_DATA: "EXPORT_DATA",
  /** Invite further people into the tenant and manage their access. */
  MANAGE_ACCESS: "MANAGE_ACCESS",
} as const;

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

const ROLE_CAPABILITIES: Record<UserRole, ReadonlySet<Capability>> = {
  [USER_ROLES.PRIEST]: new Set<Capability>([
    CAPABILITIES.MANAGE_MEMBERS,
    CAPABILITIES.MANAGE_SETTINGS,
    CAPABILITIES.EXPORT_DATA,
  ]),
  [USER_ROLES.TENANT_ADMIN]: new Set<Capability>([
    CAPABILITIES.MANAGE_MEMBERS,
    CAPABILITIES.DELETE_MEMBERS,
    CAPABILITIES.MANAGE_SETTINGS,
    CAPABILITIES.VIEW_AUDIT,
    CAPABILITIES.EXPORT_DATA,
    CAPABILITIES.MANAGE_ACCESS,
  ]),
};

export function can(role: string, capability: Capability): boolean {
  if (!isUserRole(role)) return false;
  return ROLE_CAPABILITIES[role].has(capability);
}

/**
 * The values a brand new tenant starts with.
 *
 * The reminder copy is supplied by the caller rather than hard-coded here,
 * because it is interface text, not configuration: whoever creates the tenant is
 * the person who will be reading and rewriting that message for years, and
 * handing an English default to a Coptic parish in Cairo only makes them delete
 * it before writing their own. The default stays free of attendance dates for a
 * second, independent reason — a prefilled third-party URL exposes its contents
 * to the provider, so dates must stay an explicit opt-in.
 */
export const DEFAULT_SETTINGS = {
  defaultIntervalDays: 30,
  dueSoonThresholdDays: 7,
  timezone: "Africa/Cairo",
  dateFormat: "DD/MM/YYYY",
  whatsappCountryCode: "20",
} as const;

export type DefaultSettings = typeof DEFAULT_SETTINGS & {
  whatsappTemplate: string;
};

/** Assembles a full settings row from the numeric defaults and a caller-supplied template. */
export function defaultSettings(whatsappTemplate: string): DefaultSettings {
  return { ...DEFAULT_SETTINGS, whatsappTemplate };
}

export const STATUS = {
  ACTIVE: "ACTIVE",
  DUE_SOON: "DUE_SOON",
  OVERDUE: "OVERDUE",
  NEVER_RECORDED: "NEVER_RECORDED",
} as const;

export type MemberStatus = (typeof STATUS)[keyof typeof STATUS];

/**
 * The durations the interface offers when a member is given more time.
 *
 * A closed set rather than a free number, for two reasons. A priest choosing
 * between a week, a fortnight and a month is choosing between three situations
 * they recognise — someone is ill, someone is away, someone has plainly been
 * missed — and a text box would ask them to do calendar arithmetic on a phone at
 * the moment they least want to. And a closed set is closed at the boundary
 * too: the value that reaches the service is one of these, so there is no way to
 * hand it a number that would push a member's due date years into the future and
 * quietly remove them from follow-up for good.
 *
 * Shortest first, so a mistaken tap grants the least time rather than the most.
 */
export const EXTENSION_PRESETS = [7, 14, 30] as const;

export const AUDIT_ACTIONS = {
  MEMBER_CREATED: "MEMBER_CREATED",
  MEMBER_UPDATED: "MEMBER_UPDATED",
  /** A whole roster imported at once. One event for the batch, not one per person. */
  MEMBERS_IMPORTED: "MEMBERS_IMPORTED",
  CONFESSION_RECORDED: "CONFESSION_RECORDED",
  MEMBER_ARCHIVED: "MEMBER_ARCHIVED",
  MEMBER_RESTORED: "MEMBER_RESTORED",
  MEMBER_PERMANENTLY_DELETED: "MEMBER_PERMANENTLY_DELETED",
  /**
   * The reminder link was opened for a member.
   *
   * Recorded because "who has been asked to come back, and who has not" is a
   * real operational fact about a parish, and because a marker that silently
   * appeared on a member with no explanation is worse than no marker. The audit
   * row carries the member's id and nothing else: not the message, which is
   * already in the parish's settings and in the recipient's WhatsApp, and
   * certainly nothing about the confession itself.
   */
  MEMBER_REMINDED: "MEMBER_REMINDED",
  MEMBER_EXTENDED: "MEMBER_EXTENDED",
  MEMBER_EXTENSION_REMOVED: "MEMBER_EXTENSION_REMOVED",
  SETTINGS_UPDATED: "SETTINGS_UPDATED",
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  SESSION_REVOKED: "SESSION_REVOKED",
  DATA_EXPORTED: "DATA_EXPORTED",
  TENANT_CREATED: "TENANT_CREATED",
  INVITE_REDEEMED: "INVITE_REDEEMED",
  MEMBER_INVITED: "MEMBER_INVITED",
} as const;

export const TEMPLATE_PLACEHOLDERS = [
  "name",
  "lastConfessionDate",
  "nextDueDate",
  "daysOverdue",
] as const;

export type TemplatePlaceholder = (typeof TEMPLATE_PLACEHOLDERS)[number];
