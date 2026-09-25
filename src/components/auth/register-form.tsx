"use client";

import { useActionState } from "react";
import { registerAction } from "@/app/actions/account-actions";
import { INITIAL_ACTION_STATE } from "@/lib/action-state";
import type { Dictionary } from "@/lib/dictionaries/en";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * Registration form for a priest arriving with an invitation code.
 *
 * There is no tenant selector, no parish picker and no organization code field
 * beyond the invitation itself. The code determines where the account lands, so
 * there is deliberately nothing on this form for a tampered client to redirect
 * towards another priest's data.
 */
export function RegisterForm({
  showTenantName,
  dict,
}: {
  showTenantName: boolean;
  dict: Dictionary;
}) {
  const [state, formAction] = useActionState(registerAction, INITIAL_ACTION_STATE);
  const t = dict.auth.register;

  return (
    <form action={formAction} className="auth-form">
      {state.message ? (
        <div className="form-alert form-alert--error" role="alert">
          {state.message}
        </div>
      ) : null}

      <div className="field-group">
        <label htmlFor="inviteCode">{t.code}</label>
        <input
          id="inviteCode"
          name="inviteCode"
          type="text"
          autoComplete="off"
          spellCheck={false}
          maxLength={64}
          required
          autoFocus
        />
        <p className="field-hint">{t.codeHint}</p>
      </div>

      {showTenantName ? (
        <div className="field-group">
          <label htmlFor="tenantName">{t.tenantName}</label>
          <input
            id="tenantName"
            name="tenantName"
            type="text"
            autoComplete="organization"
            maxLength={120}
          />
        </div>
      ) : null}

      <div className="field-group">
        <label htmlFor="name">{t.name}</label>
        <input id="name" name="name" type="text" autoComplete="name" required />
      </div>

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
        />
      </div>

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
