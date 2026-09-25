"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordConfessionAction } from "@/app/actions/member-actions";
import { formatDate, type SupportedDateFormat } from "@/lib/dates";
import type { Dictionary } from "@/lib/dictionaries/en";
import { fill, type Locale } from "@/lib/i18n";
import { CloseIcon } from "@/components/ui/icons";

/**
 * Who is about to be recorded, and the calendar to record them against.
 *
 * The locale and dictionary deliberately stay off this shape and travel as
 * separate props: a record target is a *fact about a person* that gets passed
 * between components, while the language is a property of the screen. Mixing
 * them meant every parent that built a target had to also carry two values it
 * merely forwards.
 */
export interface RecordTarget {
  id: string;
  name: string;
  lastConfessionDate: string | null;
  nextDueDate: string | null;
  today: string;
  dateFormat: SupportedDateFormat;
}

export function RecordConfessionDialog({
  target,
  onClose,
  onRecorded,
  locale,
  dict,
}: {
  target: RecordTarget | null;
  onClose: () => void;
  onRecorded: (message: string) => void;
  locale: Locale;
  dict: Dictionary;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [date, setDate] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (target && !dialog.open) {
      setDate(target.today);
      setError("");
      dialog.showModal();
    } else if (!target && dialog.open) {
      dialog.close();
    }
  }, [target]);

  function closeDialog() {
    dialogRef.current?.close();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target) return;

    setError("");
    startTransition(async () => {
      const result = await recordConfessionAction({
        memberId: target.id,
        confessionDate: date,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      router.refresh();
      onRecorded(fill(dict.members.recordDialog.success, { name: target.name }));
      closeDialog();
    });
  }

  const alreadyRecorded = target?.lastConfessionDate === date;

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      aria-labelledby="record-dialog-title"
    >
      {target ? (
        <form className="confirm-dialog__body" onSubmit={handleSubmit}>
          <div className="dialog-header">
            <div>
              <p className="eyebrow">{dict.members.recordDialog.eyebrow}</p>
              <h2 id="record-dialog-title">
                {fill(dict.members.recordDialog.title, { name: target.name })}
              </h2>
              <p>{dict.members.recordDialog.body}</p>
            </div>
            <button
              className="icon-button"
              type="button"
              onClick={closeDialog}
              aria-label={dict.members.recordDialog.close}
            >
              <CloseIcon />
            </button>
          </div>

          <div className="confirm-date-comparison">
            <div className="confirm-date">
              <span>{dict.members.recordDialog.previous}</span>
              <strong>
                {target.lastConfessionDate
                  ? formatDate(
                      target.lastConfessionDate,
                      target.dateFormat,
                      locale,
                      dict.dates.noRecord,
                    )
                  : dict.dates.noRecord}
              </strong>
            </div>
            <span aria-hidden="true">→</span>
            <div className="confirm-date confirm-date--new">
              <span>{dict.members.recordDialog.newDate}</span>
              <strong>
                {date
                  ? formatDate(date, target.dateFormat, locale, dict.dates.noRecord)
                  : dict.members.recordDialog.selectDate}
              </strong>
            </div>
          </div>

          <div className="field-group">
            <label htmlFor={`confession-date-${target.id}`}>
              {dict.members.recordDialog.field}
            </label>
            <input
              id={`confession-date-${target.id}`}
              type="date"
              value={date}
              min={target.lastConfessionDate ?? undefined}
              max={target.today}
              onChange={(event) => setDate(event.target.value)}
              required
              autoFocus
            />
          </div>

          {alreadyRecorded ? (
            <div className="form-alert form-alert--warning" style={{ marginTop: 14 }}>
              {dict.members.recordDialog.duplicateWarning}
            </div>
          ) : null}
          {error ? (
            <div className="form-alert form-alert--error" style={{ marginTop: 14 }} role="alert">
              {error}
            </div>
          ) : null}

          <div className="dialog-actions">
            <button className="button button--secondary" type="button" onClick={closeDialog}>
              {dict.common.cancel}
            </button>
            <button
              className="button button--primary"
              type="submit"
              disabled={pending || !date || alreadyRecorded}
            >
              {pending
                ? dict.members.recordDialog.pending
                : dict.members.recordDialog.submit}
            </button>
          </div>
        </form>
      ) : null}
    </dialog>
  );
}
