"use client";

import { useActionState } from "react";
import { resetPasswordAction } from "@/app/actions/account-actions";
import { INITIAL_ACTION_STATE } from "@/lib/action-state";
import type { Dictionary } from "@/lib/dictionaries/en";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * Password reset form.
 *
 * The token arrives in the query string and is carried in a hidden field rather
 * than read on the client. The server action re-validates it against the
 * database regardless, so nothing here is trusted; the hidden field simply
 * carries the value the user was sent.
 */
export function ResetPasswordForm({
  token,
  dict,
}: {
  token: string;
  dict: Dictionary;
}) {
  const [state, formAction] = useActionState(resetPasswordAction, INITIAL_ACTION_STATE);
  const t = dict.auth.resetPassword;

  return (
    <form action={formAction} className="auth-form">
      {state.message ? (
        <div className="form-alert form-alert--error" role="alert">
          {state.message}
        </div>
      ) : null}

      <input type="hidden" name="token" value={token} />

      <div className="field-group">
        <label htmlFor="password">{t.password}</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          dir="ltr"
          required
          autoFocus
        />
        <p className="field-hint">{t.passwordHint}</p>
      </div>

      <SubmitButton
        pendingLabel={t.pending}
        className="button button--primary button--full"
      >
        {t.submit}
      </SubmitButton>
    </form>
  );
}
