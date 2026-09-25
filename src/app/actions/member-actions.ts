"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { CAPABILITIES } from "@/lib/constants";
import { getTodayInTimeZone } from "@/lib/dates";
import { getRequestLocale } from "@/lib/i18n-server";
import {
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
  permanentlyDeleteMember,
  recordConfession,
  restoreMember,
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
