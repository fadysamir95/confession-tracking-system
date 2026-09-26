"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { CAPABILITIES } from "@/lib/constants";
import { getTodayInTimeZone } from "@/lib/dates";
import { getRequestLocale } from "@/lib/i18n-server";
import {
  extendMemberSchema,
  firstValidationFailure,
  formDataToObject,
  memberCreateSchema,
  memberIdSchema,
  memberUpdateSchema,
  recordConfessionSchema,
} from "@/lib/validation";
import { requireCapability } from "@/server/auth";
import {
  archiveMember,
  createMember,
  extendMember,
  markReminderSent,
  permanentlyDeleteMember,
  recordConfession,
  restoreMember,
  undoExtension,
  updateMember,
} from "@/server/member-service";
import { getSettings } from "@/server/settings";
import {
  confirmationState,
  failureState,
  refusalState,
  validationFailure,
} from "@/app/actions/error-response";

/**
 * `today` is the tenant's calendar day, not the server's.
 *
 * Every date rule in this file — refusing a future confession, refusing one
 * earlier than the last — is relative to the parish's own today. Deriving it
 * from the server clock would let a confession dated tomorrow through for a few
 * hours a day depending on where the database happens to run.
 */
async function tenantToday(tenantId: string): Promise<string> {
  const locale = await getRequestLocale();
  const settings = await getSettings(tenantId, locale);
  return getTodayInTimeZone(settings.timezone);
}

function refreshMemberViews(): void {
  revalidatePath("/");
  revalidatePath("/members");
  revalidatePath("/settings/archived");
}

export async function createMemberAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await requireCapability(CAPABILITIES.MANAGE_MEMBERS);
  const parsed = memberCreateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return validationFailure(firstValidationFailure(parsed.error));
  }

  try {
    await createMember(context, parsed.data, await tenantToday(context.tenant.id));
    refreshMemberViews();
  } catch (error) {
    return failureState(error, "saveMember");
  }

  redirect("/members?created=1");
}

export async function updateMemberAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await requireCapability(CAPABILITIES.MANAGE_MEMBERS);
  const parsed = memberUpdateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return validationFailure(firstValidationFailure(parsed.error));
  }

  try {
    await updateMember(context, parsed.data);
    refreshMemberViews();
  } catch (error) {
    return failureState(error, "updateMember");
  }

  redirect("/members?updated=1");
}

export async function recordConfessionAction(input: {
  memberId: string;
  confessionDate: string;
}): Promise<ActionState> {
  const context = await requireCapability(CAPABILITIES.MANAGE_MEMBERS);
  const parsed = recordConfessionSchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(firstValidationFailure(parsed.error));
  }

  try {
    await recordConfession(
      context,
      parsed.data.memberId,
      parsed.data.confessionDate,
      await tenantToday(context.tenant.id),
    );
    refreshMemberViews();
    return confirmationState("recorded");
  } catch (error) {
    return failureState(error, "recordConfession");
  }
}

/**
 * Note that the reminder link was opened for a member.
 *
 * Deliberately returns nothing and shows nothing. The click that calls this
 * also opens WhatsApp in a new tab, so by the time the round trip finishes the
 * priest is looking at a conversation, not at this page — and the one thing
 * that could usefully be said is "reminder sent", which nobody can know. The
 * link is not blocked on it either way: a marker that failed to save is a
 * cosmetic loss, and delaying or suppressing the message to protect a cosmetic
 * loss would trade the thing that matters for the thing that does not.
 *
 * So a failure here is swallowed, deliberately and on purpose. The alternative
 * is a red toast appearing on a screen the priest has already left, telling
 * them about a problem with something they do not care about.
 */
export async function markReminderSentAction(memberId: string): Promise<void> {
  try {
    const context = await requireCapability(CAPABILITIES.MANAGE_MEMBERS);
    const parsedId = memberIdSchema.safeParse(memberId);
    if (!parsedId.success) return;

    await markReminderSent(context, parsedId.data);
    refreshMemberViews();
  } catch {
    // As above: the message is already on its way. See the note above.
  }
}

export async function extendMemberAction(input: {
  memberId: string;
  days: number;
}): Promise<ActionState> {
  const context = await requireCapability(CAPABILITIES.MANAGE_MEMBERS);
  const parsed = extendMemberSchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(firstValidationFailure(parsed.error));
  }

  try {
    await extendMember(
      context,
      parsed.data.memberId,
      parsed.data.days,
      await tenantToday(context.tenant.id),
    );
    refreshMemberViews();
    return confirmationState("extended", { days: parsed.data.days });
  } catch (error) {
    return failureState(error, "extendMember");
  }
}

export async function undoExtensionAction(memberId: string): Promise<ActionState> {
  const context = await requireCapability(CAPABILITIES.MANAGE_MEMBERS);
  const parsedId = memberIdSchema.safeParse(memberId);
  if (!parsedId.success) return refusalState("MEMBER_NOT_FOUND");

  try {
    await undoExtension(context, parsedId.data);
    refreshMemberViews();
    return confirmationState("extensionRemoved");
  } catch (error) {
    return failureState(error, "undoExtension");
  }
}

export async function archiveMemberAction(memberId: string): Promise<ActionState> {
  const context = await requireCapability(CAPABILITIES.MANAGE_MEMBERS);
  const parsedId = memberIdSchema.safeParse(memberId);
  if (!parsedId.success) return refusalState("MEMBER_NOT_FOUND");

  try {
    await archiveMember(context, parsedId.data);
    refreshMemberViews();
    return confirmationState("archived");
  } catch (error) {
    return failureState(error, "archiveMember");
  }
}

export async function restoreMemberAction(memberId: string): Promise<ActionState> {
  const context = await requireCapability(CAPABILITIES.MANAGE_MEMBERS);
  const parsedId = memberIdSchema.safeParse(memberId);
  if (!parsedId.success) return refusalState("ARCHIVED_MEMBER_NOT_FOUND");

  try {
    await restoreMember(context, parsedId.data);
    refreshMemberViews();
    return confirmationState("restored");
  } catch (error) {
    return failureState(error, "restoreMember");
  }
}

export async function permanentlyDeleteMemberAction(
  memberId: string,
  currentPassword: string,
): Promise<ActionState> {
  // The gate is DELETE_MEMBERS, not MANAGE_MEMBERS: a priest who can archive
  // and restore a member must not be able to erase one irreversibly.
  const context = await requireCapability(CAPABILITIES.DELETE_MEMBERS);
  const parsedId = memberIdSchema.safeParse(memberId);
  if (!parsedId.success) return refusalState("MEMBER_NOT_FOUND");

  try {
    await permanentlyDeleteMember(context, parsedId.data, currentPassword);
    refreshMemberViews();
    return confirmationState("deleted");
  } catch (error) {
    return failureState(error, "deleteMember");
  }
}
