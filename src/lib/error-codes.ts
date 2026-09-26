import type { Dictionary } from "@/lib/dictionaries/en";
import { fill } from "@/lib/i18n";

/**
 * Every failure the domain can report, as a closed set.
 *
 * The services used to carry a ready-made English sentence on each throw. That
 * put a translation problem inside the database layer: the same refusal — "you
 * cannot edit members" — would have to be re-spelled in every language at every
 * call site, and a service that knows how to phrase a sentence for a priest is a
 * service that will eventually phrase it wrongly for one.
 *
 * Instead a service reports *what happened* and the presentation layer decides
 * how to say it. `Record<ErrorCode, ...>` below is exhaustive in both
 * directions, so adding a code without a message, or a message without a code,
 * is a compile error.
 */
export const ERROR_CODES = [
  // Capability gates. These are distinct codes rather than one FORBIDDEN because
  // the remedy differs: "you cannot permanently delete" tells an admin they need
  // a different role, whereas "only a tenant administrator can invite" tells a
  // priest that nobody in their parish can help them and they should contact the
  // operator.
  "CANNOT_ADD",
  "CANNOT_EDIT",
  "CANNOT_RECORD",
  "CANNOT_ARCHIVE",
  "CANNOT_RESTORE",
  "ADMIN_ONLY_DELETE",
  "ADMIN_ONLY_INVITE",
  "ADMIN_ONLY",

  // Member lifecycle.
  "MEMBER_NOT_FOUND",
  "ACTIVE_MEMBER_NOT_FOUND",
  "ARCHIVED_MEMBER_NOT_FOUND",
  "NOT_ARCHIVED",
  "DUPLICATE_MEMBER",
  "ARCHIVED_DUPLICATE",
  "NO_EXTENSION_TO_UNDO",

  // Bulk roster import.
  "IMPORT_TOO_LARGE",
  "IMPORT_EMPTY",
  "IMPORT_UNREADABLE",

  // Attendance.
  "INVALID_DATE",
  "FUTURE_DATE",
  "DUPLICATE_DATE",
  "DATE_OUT_OF_ORDER",

  // Credentials and sessions.
  "INVALID_CREDENTIALS",
  "PASSWORD_REQUIRED",
  "INVALID_PASSWORD",
  "SESSION_EXPIRED",
  "SESSION_NOT_FOUND",

  // Registration and invitations.
  "EMAIL_TAKEN",
  "INVALID_ROLE",
  "INVALID_INVITE",
  "INVITE_EXPIRED",
  "INVITE_USED",
  "INVITE_NOT_FOUND",
  "RESET_INVALID",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Dictionary keys that stand in for a thrown value the domain did not name. */
export type ErrorFallback = keyof Dictionary["errors"];

const CODE_TO_MESSAGE: Record<ErrorCode, ErrorFallback> = {
  CANNOT_ADD: "cannotAdd",
  CANNOT_EDIT: "cannotEdit",
  CANNOT_RECORD: "cannotRecord",
  CANNOT_ARCHIVE: "cannotArchive",
  CANNOT_RESTORE: "cannotRestore",
  ADMIN_ONLY_DELETE: "adminOnlyDelete",
  ADMIN_ONLY_INVITE: "adminOnlyInvite",
  ADMIN_ONLY: "adminOnly",

  MEMBER_NOT_FOUND: "memberNotFound",
  ACTIVE_MEMBER_NOT_FOUND: "activeMemberNotFound",
  ARCHIVED_MEMBER_NOT_FOUND: "archivedMemberNotFound",
  NOT_ARCHIVED: "archiveOnlyDelete",
  DUPLICATE_MEMBER: "activeDuplicate",
  ARCHIVED_DUPLICATE: "archivedDuplicate",
  NO_EXTENSION_TO_UNDO: "noExtensionToUndo",
  IMPORT_TOO_LARGE: "importTooLarge",
  IMPORT_EMPTY: "importEmpty",
  IMPORT_UNREADABLE: "importUnreadable",

  INVALID_DATE: "invalidDate",
  FUTURE_DATE: "futureDate",
  DUPLICATE_DATE: "duplicateDate",
  DATE_OUT_OF_ORDER: "outOfOrder",

  INVALID_CREDENTIALS: "invalidCredentials",
  PASSWORD_REQUIRED: "passwordRequired",
  INVALID_PASSWORD: "passwordIncorrect",
  SESSION_EXPIRED: "sessionExpired",
  SESSION_NOT_FOUND: "sessionNotFound",

  EMAIL_TAKEN: "emailTaken",
  INVALID_ROLE: "unknownRole",
  INVALID_INVITE: "inviteInvalid",
  INVITE_EXPIRED: "inviteExpired",
  INVITE_USED: "inviteUsed",
  INVITE_NOT_FOUND: "inviteNotFound",
  RESET_INVALID: "resetInvalid",
};

export function errorMessage(
  code: ErrorCode,
  dict: Dictionary,
  params: Record<string, string | number> = {},
): string {
  return fill(dict.errors[CODE_TO_MESSAGE[code]], params);
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}
