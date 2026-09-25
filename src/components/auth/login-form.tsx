"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth-actions";
import { INITIAL_ACTION_STATE } from "@/lib/action-state";
import type { Dictionary } from "@/lib/dictionaries/en";
import { SubmitButton } from "@/components/ui/submit-button";

export function LoginForm({ dict }: { dict: Dictionary }) {
  const [state, formAction] = useActionState(loginAction, INITIAL_ACTION_STATE);
  const t = dict.auth.signIn;

  return (
    <form action={formAction} className="auth-form">
      {state.message ? (
        <div className="form-alert form-alert--error" role="alert">
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
      <div className="field-group">
        <label htmlFor="password">{t.password}</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          dir="ltr"
          required
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
