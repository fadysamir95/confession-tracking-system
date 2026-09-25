"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePasswordAction, revokeSessionAction } from "@/app/actions/auth-actions";
import { INITIAL_ACTION_STATE } from "@/lib/action-state";
import { formatDateTime } from "@/lib/dates";
import type { Dictionary } from "@/lib/dictionaries/en";
import { fill, type Locale } from "@/lib/i18n";
import { SubmitButton } from "@/components/ui/submit-button";
import { ShieldIcon } from "@/components/ui/icons";

export interface SessionView {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

function ChangePasswordForm({ dict }: { dict: Dictionary }) {
  const [state, formAction] = useActionState(changePasswordAction, INITIAL_ACTION_STATE);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="security-form">
      {state.message ? (
        <div
          className={`form-alert ${state.ok ? "form-alert--success" : "form-alert--error"}`}
          role="status"
        >
          {state.message}
        </div>
      ) : null}
      <div className="form-grid">
        <div className="field-group field-group--full">
          <label htmlFor="currentPassword">{dict.security.currentPassword}</label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <div className="field-group field-group--full">
          <label htmlFor="newPassword">{dict.security.newPassword}</label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
          <p className="field-hint">{dict.security.passwordHint}</p>
        </div>
      </div>
      <div className="security-form__action">
        <SubmitButton pendingLabel={dict.security.changing}>{dict.security.change}</SubmitButton>
      </div>
    </form>
  );
}

function RevokeSessionForm({ sessionId, dict }: { sessionId: string; dict: Dictionary }) {
  const [state, formAction] = useActionState(revokeSessionAction, INITIAL_ACTION_STATE);
  return (
    <form action={formAction}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <SubmitButton
        className="button button--danger button--small"
        pendingLabel={dict.security.revoking}
      >
        {dict.security.revoke}
      </SubmitButton>
      {state.message ? (
        <span className="visually-hidden" role="status">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

export function SecuritySettings({
  sessions,
  currentSessionId,
  timezone,
  locale,
  dict,
}: {
  sessions: SessionView[];
  currentSessionId: string | null;
  timezone: string;
  locale: Locale;
  dict: Dictionary;
}) {
  return (
    <section className="surface-card settings-section" id="security">
      <div className="settings-section__header">
        <div>
          <h2>{dict.security.section}</h2>
          <p>{dict.security.sectionBody}</p>
        </div>
        <ShieldIcon />
      </div>
      <div className="settings-section__body security-settings-grid">
        <div>
          <h3>{dict.security.changeTitle}</h3>
          <p className="security-description">{dict.security.changeBody}</p>
          <ChangePasswordForm dict={dict} />
        </div>
        <div>
          <h3>{dict.security.sessionsTitle}</h3>
          <p className="security-description">{dict.security.sessionsBody}</p>
          <div className="session-list">
            {sessions.map((session) => {
              const isCurrent = session.id === currentSessionId;
              return (
                <div className="session-item" key={session.id}>
                  <div>
                    <strong>
                      {isCurrent ? dict.security.thisDevice : dict.security.anotherDevice}
                    </strong>
                    {isCurrent ? (
                      <span className="current-session">{dict.security.current}</span>
                    ) : null}
                    <small>
                      {fill(dict.security.signedIn, {
                        date: formatDateTime(session.createdAt, timezone, locale),
                      })}
                    </small>
                    <small>
                      {fill(dict.security.expires, {
                        date: formatDateTime(session.expiresAt, timezone, locale),
                      })}
                    </small>
                  </div>
                  {isCurrent ? null : (
                    <RevokeSessionForm sessionId={session.id} dict={dict} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
