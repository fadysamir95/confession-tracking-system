"use client";

import { useActionState } from "react";
import { forgotPasswordAction } from "@/app/actions/account-actions";
import { INITIAL_ACTION_STATE } from "@/lib/action-state";
import type { Dictionary } from "@/lib/dictionaries/en";
import { SubmitButton } from "@/components/ui/submit-button";

export function ForgotPasswordForm({ dict }: { dict: Dictionary }) {
  const [state, formAction] = useActionState(forgotPasswordAction, INITIAL_ACTION_STATE);
  const t = dict.auth.forgotPassword;

  return (
    <form action={formAction} className="auth-form">
      {state.message ? (
        <div
          className={`form-alert ${state.ok ? "form-alert--success" : "form-alert--error"}`}
          role={state.ok ? "status" : "alert"}
        >
          {state.message}
        </div>
      ) : null}

      <div className="field-group">
        <label htmlFor="email">{t.email}</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          dir="ltr"
          required
          autoFocus
        />
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
