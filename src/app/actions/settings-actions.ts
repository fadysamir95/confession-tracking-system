"use server";

import { revalidatePath } from "next/cache";
import { AUDIT_ACTIONS, CAPABILITIES } from "@/lib/constants";
import type { ActionState } from "@/lib/action-state";
import {
  firstValidationFailure,
  formDataToObject,
  settingsSchema,
} from "@/lib/validation";
import { requireCapability } from "@/server/auth";
import { recordAudit } from "@/server/audit";
import { withTenant } from "@/server/db";
import { confirmationState, validationFailure } from "@/app/actions/error-response";

export async function updateSettingsAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await requireCapability(CAPABILITIES.MANAGE_SETTINGS);
  const parsed = settingsSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return validationFailure(firstValidationFailure(parsed.error));
  }

  // The settings write and its audit entry share one tenant-scoped
  // transaction, so a saved change is never recorded without a trail entry and
  // the trail entry can never be written for a different tenant.
  await withTenant(context.tenant.id, async (db) => {
    await db.tenantSettings.upsert({
      where: { tenantId: context.tenant.id },
      update: parsed.data,
      create: { tenantId: context.tenant.id, ...parsed.data },
    });
    await recordAudit(db, {
      tenantId: context.tenant.id,
      action: AUDIT_ACTIONS.SETTINGS_UPDATED,
      userId: context.user.id,
    });
  });

  revalidatePath("/");
  revalidatePath("/members");
  revalidatePath("/settings");
  return confirmationState("settingsSaved");
}
