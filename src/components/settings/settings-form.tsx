"use client";

import { useActionState, useRef, useState } from "react";
import { updateSettingsAction } from "@/app/actions/settings-actions";
import { INITIAL_ACTION_STATE } from "@/lib/action-state";
import { TEMPLATE_PLACEHOLDERS } from "@/lib/constants";
import { formatDate, type SupportedDateFormat } from "@/lib/dates";
import type { Dictionary } from "@/lib/dictionaries/en";
import { fill, formatNumber, formatPlural, type Locale } from "@/lib/i18n";
import { renderWhatsAppTemplate } from "@/lib/whatsapp";
import { SubmitButton } from "@/components/ui/submit-button";
import { ExportMembersButton } from "@/components/settings/export-members-button";
import { ShieldIcon } from "@/components/ui/icons";

export interface SettingsFormValues {
  defaultIntervalDays: number;
  dueSoonThresholdDays: number;
  timezone: string;
  dateFormat: SupportedDateFormat;
  whatsappCountryCode: string;
  whatsappTemplate: string;
}

export function SettingsForm({
  settings,
  timezones,
  locale,
  dict,
}: {
  settings: SettingsFormValues;
  timezones: string[];
  locale: Locale;
  dict: Dictionary;
}) {
  const [state, formAction] = useActionState(updateSettingsAction, INITIAL_ACTION_STATE);
  const [template, setTemplate] = useState(settings.whatsappTemplate);
  const templateRef = useRef<HTMLTextAreaElement>(null);

  const preview = renderWhatsAppTemplate(template, {
    name: dict.members.columns.name,
    lastConfessionDate: formatDate(
      "2026-08-15",
      settings.dateFormat,
      locale,
      dict.dates.noRecord,
    ),
    nextDueDate: formatDate(
      "2026-09-14",
      settings.dateFormat,
      locale,
      dict.dates.noRecord,
    ),
    daysOverdue: formatPlural(11, locale, dict.days),
  });

  function insertPlaceholder(placeholder: (typeof TEMPLATE_PLACEHOLDERS)[number]) {
    const textarea = templateRef.current;
    const token = `{{${placeholder}}}`;
    if (!textarea) {
      setTemplate((current) => `${current}${token}`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    setTemplate((current) => `${current.slice(0, start)}${token}${current.slice(end)}`);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <form action={formAction} className="settings-form">
      {state.message ? (
        <div
          className={`form-alert ${state.ok ? "form-alert--success" : "form-alert--error"}`}
          role="status"
        >
          {state.message}
        </div>
      ) : null}

      <section className="surface-card settings-section">
        <div className="settings-section__header">
          <div>
            <h2>{dict.settings.general}</h2>
            <p>{dict.settings.generalBody}</p>
          </div>
        </div>
        <div className="settings-section__body form-grid">
          <div className="field-group">
            <label htmlFor="defaultIntervalDays">{dict.settings.defaultInterval}</label>
            <input
              id="defaultIntervalDays"
              name="defaultIntervalDays"
              type="number"
              min={1}
              max={365}
              defaultValue={settings.defaultIntervalDays}
              required
            />
            <p className="field-hint">
              {fill(dict.phrases.defaultIntervalHint, {
                count: formatNumber(settings.defaultIntervalDays, locale),
              })}
            </p>
          </div>
          <div className="field-group">
            <label htmlFor="dueSoonThresholdDays">{dict.settings.dueSoonThreshold}</label>
            <input
              id="dueSoonThresholdDays"
              name="dueSoonThresholdDays"
              type="number"
              min={0}
              max={90}
              defaultValue={settings.dueSoonThresholdDays}
              required
            />
          </div>
          <div className="field-group">
            <label htmlFor="timezone">{dict.settings.timezone}</label>
            <input
              id="timezone"
              name="timezone"
              list="timezone-list"
              defaultValue={settings.timezone}
              required
            />
            <datalist id="timezone-list">
              {timezones.map((timezone) => (
                <option key={timezone} value={timezone} />
              ))}
            </datalist>
          </div>
          <div className="field-group">
            <label htmlFor="dateFormat">{dict.settings.dateFormat}</label>
            <select id="dateFormat" name="dateFormat" defaultValue={settings.dateFormat}>
              <option value="DD/MM/YYYY">
                {formatDate("2026-09-25", "DD/MM/YYYY", locale, dict.dates.noRecord)}
              </option>
              <option value="D MMM YYYY">
                {formatDate("2026-09-25", "D MMM YYYY", locale, dict.dates.noRecord)}
              </option>
            </select>
          </div>
        </div>
      </section>

      <section className="surface-card settings-section">
        <div className="settings-section__header">
          <div>
            <h2>{dict.settings.whatsapp}</h2>
            <p>{dict.settings.whatsappBody}</p>
          </div>
        </div>
        <div className="settings-section__body">
          <div className="whatsapp-settings-grid">
            <div>
              <div className="field-group">
                <label htmlFor="whatsappCountryCode">{dict.settings.countryCode}</label>
                <input
                  id="whatsappCountryCode"
                  name="whatsappCountryCode"
                  inputMode="numeric"
                  defaultValue={settings.whatsappCountryCode}
                  pattern="[0-9]{1,4}"
                  maxLength={4}
                  required
                />
                <p className="field-hint">{dict.settings.countryCodeHint}</p>
              </div>
            </div>
            <div className="template-preview">
              <span>{dict.settings.preview}</span>
              <p>{preview || dict.settings.previewEmpty}</p>
              <small>{dict.settings.previewNote}</small>
            </div>
          </div>

          <div className="field-group template-field">
            <label htmlFor="whatsappTemplate">{dict.settings.template}</label>
            <textarea
              ref={templateRef}
              id="whatsappTemplate"
              name="whatsappTemplate"
              value={template}
              onChange={(event) => setTemplate(event.target.value)}
              maxLength={1000}
              required
            />
            <div
              className="placeholder-buttons"
              aria-label={dict.settings.insertPlaceholder}
            >
              {TEMPLATE_PLACEHOLDERS.map((placeholder) => (
                <button
                  key={placeholder}
                  type="button"
                  onClick={() => insertPlaceholder(placeholder)}
                >
                  {`{{${placeholder}}}`}
                </button>
              ))}
            </div>
            <p className="field-hint">
              {fill(dict.settings.templateHint, { nameToken: "{{name}}" })}
            </p>
          </div>
        </div>
      </section>

      <section className="surface-card settings-section">
        <div className="settings-section__header">
          <div>
            <h2>{dict.settings.data}</h2>
            <p>{dict.settings.dataBody}</p>
          </div>
        </div>
        <div className="settings-section__body data-settings">
          <div>
            <h3>{dict.settings.roster}</h3>
            <p>{dict.settings.rosterBody}</p>
          </div>
          <ExportMembersButton dict={dict} />
        </div>
        <div className="settings-section__body backup-guidance">
          <ShieldIcon />
          <div>
            <h3>{dict.settings.backup}</h3>
            <p>{dict.settings.backupBody}</p>
          </div>
        </div>
      </section>

      <div className="settings-save-bar">
        <span>{dict.settings.applyNote}</span>
        <SubmitButton pendingLabel={dict.settings.saving}>{dict.settings.save}</SubmitButton>
      </div>
    </form>
  );
}
