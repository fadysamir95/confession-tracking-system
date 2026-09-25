"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  authenticateCredentials,
  changeUserPassword,
  createSession,
  destroyCurrentSession,
  getTenantContext,
  revokeAllOtherSessions,
  revokeOwnSession,
} from "@/server/auth";
import { getMemberDetails } from "@/server/queries";
import {
  changePasswordSchema,
  firstValidationFailure,
  formDataToObject,
  loginSchema,
  memberIdSchema,
} from "@/lib/validation";
import type { ActionState } from "@/lib/action-state";
import { AUDIT_ACTIONS } from "@/lib/constants";
import { recordAudit } from "@/server/audit";
import { withTenant } from "@/server/db";
import { resolveLocale } from "@/lib/i18n";
import { LOCALE_COOKIE, localeCookieOptions } from "@/lib/i18n-server";
import { confirmationState, refusalState, validationFailure } from "@/app/actions/error-response";

/**
 * Derives a stable per-client identifier for rate limiting.
 *
 * A forwarded address is only as trustworthy as the proxy that set it, which is
 * why it is used to *raise* a limit rather than to grant anything: an attacker
 * who can spoof the header can evade the per-network limit, but the per-account
 * limit still applies, so the account lockout cannot be bypassed. The value is
 * hashed before it is used as a key, so no address is stored.
 */
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

export async function loginAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return validationFailure(firstValidationFailure(parsed.error));
  }

  const result = await authenticateCredentials(
    parsed.data.email,
    parsed.data.password,
    await getClientIdentifier(),
  );
  if (!result) {
    return refusalState("INVALID_CREDENTIALS");
  }

  await createSession(result.user.id);
  // Take the interface language from the account, not from whatever this
  // particular browser happened to use last. Otherwise a priest who set Arabic
  // on their laptop and signs in on a shared parish tablet would silently
  // overwrite the preference they have at home.
  (await cookies()).set(
    LOCALE_COOKIE,
    resolveLocale(result.user.locale),
    localeCookieOptions(),
  );
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroyCurrentSession();
  redirect("/login");
}

export async function getMemberDetailsAction(memberId: string) {
  // This action is callable directly by the client, so the dashboard layout is not an
  // authorization boundary for it. The context comes from the session, and the member
  // lookup is scoped to that tenant, so passing another tenant's id returns null.
  const context = await getTenantContext();
  if (!context) {
    return { ok: false as const, data: null };
  }

  const parsedId = memberIdSchema.safeParse(memberId);
  if (!parsedId.success) {
    return { ok: false as const, data: null };
  }

  const member = await getMemberDetails(context, parsedId.data);
  return member
    ? { ok: true as const, data: member }
    : { ok: false as const, data: null };
}

export async function changePasswordAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await getTenantContext();
  if (!context) return refusalState("SESSION_EXPIRED");

  const parsed = changePasswordSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return validationFailure(firstValidationFailure(parsed.error));
  }

  const changed = await changeUserPassword(
    context.user.id,
    parsed.data.currentPassword,
    parsed.data.newPassword,
  );

  if (!changed) {
    return refusalState("INVALID_PASSWORD");
  }

  // Every other session is dropped once the new password is in place, so a
  // stolen cookie stops working the moment the owner rotates credentials.
  await revokeAllOtherSessions(context.user.id, context.sessionId);

  await withTenant(context.tenant.id, (db) =>
    recordAudit(db, {
      tenantId: context.tenant.id,
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      userId: context.user.id,
    }),
  );

  revalidatePath("/settings");
  return confirmationState("passwordChanged");
}

export async function revokeSessionAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await getTenantContext();
  if (!context) return refusalState("SESSION_EXPIRED");

  const sessionId = String(formData.get("sessionId") ?? "");
  // The session making the request cannot revoke itself; that would be a
  // confusing way to sign out and is almost always a mis-click.
  if (!sessionId || sessionId === context.sessionId) {
    return refusalState("SESSION_NOT_FOUND");
  }

  const revoked = await revokeOwnSession(context.user.id, sessionId);
  if (!revoked) {
    return refusalState("SESSION_NOT_FOUND");
  }

  await withTenant(context.tenant.id, (db) =>
    recordAudit(db, {
      tenantId: context.tenant.id,
      action: AUDIT_ACTIONS.SESSION_REVOKED,
      userId: context.user.id,
    }),
  );

  revalidatePath("/settings");
  return confirmationState("sessionRevoked");
}
