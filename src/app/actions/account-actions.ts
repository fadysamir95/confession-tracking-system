"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import {
  firstValidationFailure,
  forgotPasswordSchema,
  formDataToObject,
  registrationSchema,
  resetPasswordSchema,
} from "@/lib/validation";
import { completePasswordReset, registerWithInvite, requestPasswordReset } from "@/server/account";
import { createSession } from "@/server/auth";
import { getRequestLocale } from "@/lib/i18n-server";
import {
  confirmationState,
  failureState,
  refusalState,
  validationFailure,
} from "@/app/actions/error-response";

async function getClientIdentifier(): Promise<string> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwardedFor ||
    requestHeaders.get("x-real-ip") ||
    requestHeaders.get("user-agent") ||
    "unknown"
  );
}

/**
 * Signs a new priest in using an invitation code.
 *
 * The code decides the tenant. The form carries no tenant identifier, so there
 * is nothing here for a tampered client to point at another priest's data; the
 * worst a modified request can do is present a different invitation code, which
 * is itself a secret that is stored hashed, expires, and is single-use.
 */
export async function registerAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = registrationSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return validationFailure(firstValidationFailure(parsed.error));
  }

  const locale = await getRequestLocale();

  let userId: string;
  try {
    const result = await registerWithInvite({
      inviteCode: parsed.data.inviteCode,
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
      tenantName: parsed.data.tenantName,
      // Captured at sign-up rather than inferred later, so the account opens in
      // the language it was created in and the new tenant's reminder copy
      // starts in a language its first priest can actually read.
      locale,
    });
    userId = result.userId;
  } catch (error) {
    return failureState(error, "createAccount");
  }

  // Registration signs the new account straight in, so a priest is not asked
  // to type the password they just chose a second time.
  await createSession(userId);
  redirect("/");
}

/**
 * Starts a password reset.
 *
 * The reply is identical whether or not the address belongs to an account, so
 * this form cannot be used to discover who is registered.
 */
export async function forgotPasswordAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return validationFailure(firstValidationFailure(parsed.error));
  }

  await requestPasswordReset(parsed.data.email, await getClientIdentifier());

  // The same confirmation for every address, known or not, so this form cannot
  // be used to find out who is registered.
  return confirmationState("resetSent");
}

export async function resetPasswordAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return validationFailure(firstValidationFailure(parsed.error));
  }

  const result = await completePasswordReset(parsed.data.token, parsed.data.password);
  if (!result.ok) {
    return refusalState(result.code);
  }

  redirect("/login?reset=1");
}
