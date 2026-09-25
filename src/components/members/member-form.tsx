"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { ActionState } from "@/lib/action-state";
import { INITIAL_ACTION_STATE } from "@/lib/action-state";
import type { Dictionary } from "@/lib/dictionaries/en";
import { fill, formatNumber, type Locale } from "@/lib/i18n";
import { SubmitButton } from "@/components/ui/submit-button";
import { ShieldIcon } from "@/components/ui/icons";

export interface EditableMember {
  id: string;
  name: string;
  phone: string | null;
  confessionIntervalDays: number | null;
  administrativeNote: string | null;
}

type MemberFormAction = (
  state: ActionState,
  formData: FormData,
) => Promise<ActionState>;

export function MemberForm({
  mode,
  member,
  defaultIntervalDays,
  today,
  action,
  locale,
  dict,
}: {
  mode: "create" | "edit";
  member?: EditableMember;
  defaultIntervalDays: number;
  today: string;
  action: MemberFormAction;
  locale: Locale;
  dict: Dictionary;
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const isEdit = mode === "edit";
  const f = dict.memberForm;

  return (
    <form action={formAction} className="surface-card form-card">
      {member ? <input type="hidden" name="id" value={member.id} /> : null}
      {state.message ? (
        <div className="form-alert form-alert--error form-card__alert" role="alert">
          {state.message}
        </div>
      ) : null}

      <section className="form-section">
        <h2>{f.details}</h2>
        <p className="form-section__description">{f.detailsBody}</p>
        <div className="form-grid">
          <div className="field-group field-group--full">
            <label htmlFor="name">
              {f.name} <span className="field-required">*</span>
            </label>
            <input
              id="name"
              name="name"
              defaultValue={member?.name ?? ""}
              autoComplete="name"
              maxLength={120}
              required
              autoFocus
            />
          </div>
          <div className="field-group field-group--full">
            <label htmlFor="phone">{f.phone}</label>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              defaultValue={member?.phone ?? ""}
              autoComplete="tel"
              maxLength={30}
              placeholder={f.phonePlaceholder}
              dir="ltr"
            />
            <p className="field-hint">{f.phoneHint}</p>
          </div>
        </div>
      </section>

      <section className="form-section">
        <h2>{f.attendance}</h2>
        <p className="form-section__description">
          {fill(dict.phrases.defaultIntervalHint, {
            count: formatNumber(defaultIntervalDays, locale),
          })}
        </p>
        <div className="form-grid">
          <div className="field-group">
            <label htmlFor="customIntervalDays">{f.customInterval}</label>
            <input
              id="customIntervalDays"
              name="customIntervalDays"
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              defaultValue={member?.confessionIntervalDays ?? ""}
              placeholder={String(defaultIntervalDays)}
            />
          </div>
          {!isEdit ? (
            <div className="field-group">
              <label htmlFor="lastConfessionDate">{f.lastDate}</label>
              <input
                id="lastConfessionDate"
                name="lastConfessionDate"
                type="date"
                max={today}
                defaultValue=""
              />
              <p className="field-hint">{f.lastDateHint}</p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="form-section">
        <h2>{f.admin}</h2>
        <p className="form-section__description">{f.adminBody}</p>
        <div className="field-group">
          <label htmlFor="administrativeNote">{f.note}</label>
          <textarea
            id="administrativeNote"
            name="administrativeNote"
            defaultValue={member?.administrativeNote ?? ""}
            maxLength={280}
            placeholder={f.notePlaceholder}
          />
          <p className="field-hint">{f.noteHint}</p>
        </div>
      </section>

      <div className="privacy-inline">
        <ShieldIcon />
        <p>
          <strong>{f.privacyTitle}</strong>
          <span>{f.privacyBody}</span>
        </p>
      </div>

      <div className="form-actions">
        <Link className="button button--secondary" href="/">
          {dict.common.cancel}
        </Link>
        <SubmitButton
          pendingLabel={isEdit ? dict.common.updating : dict.common.saving}
        >
          {isEdit ? dict.members.form.saveEdit : dict.members.form.save}
        </SubmitButton>
      </div>
    </form>
  );
}
