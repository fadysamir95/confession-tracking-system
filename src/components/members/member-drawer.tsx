"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { getMemberDetailsAction } from "@/app/actions/auth-actions";
import { archiveMemberAction } from "@/app/actions/member-actions";
import { formatDate } from "@/lib/dates";
import type { Dictionary } from "@/lib/dictionaries/en";
import { fill, formatNumber, formatPlural, type Locale } from "@/lib/i18n";
import type { MemberDetails } from "@/lib/member-view-types";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  ArchiveIcon,
  CheckIcon,
  CloseIcon,
  EditIcon,
  ShieldIcon,
} from "@/components/ui/icons";
import type { RecordTarget } from "@/components/members/record-confession-dialog";
import { FollowUpActions } from "@/components/members/follow-up-actions";

export function MemberDrawer({
  memberId,
  canManageLifecycle,
  onClose,
  onRecord,
  onArchived,
  onMessage,
  locale,
  dict,
}: {
  memberId: string | null;
  canManageLifecycle: boolean;
  onClose: () => void;
  onRecord: (target: RecordTarget) => void;
  onArchived: (message: string) => void;
  onMessage: (message: string) => void;
  locale: Locale;
  dict: Dictionary;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [details, setDetails] = useState<MemberDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const d = dict.members.drawer;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (memberId && !dialog.open) {
      setLoading(true);
      setError("");
      setDetails(null);
      dialog.showModal();
      void getMemberDetailsAction(memberId).then((result) => {
        if (result.ok && result.data) {
          setDetails(result.data);
        } else {
          setError(d.notFound);
        }
        setLoading(false);
      });
    } else if (!memberId && dialog.open) {
      dialog.close();
    }
  }, [memberId, d.notFound]);

  function closeDialog() {
    dialogRef.current?.close();
  }

  function handleArchive() {
    if (!details) return;
    if (!window.confirm(fill(d.archiveConfirm, { name: details.name }))) return;

    startTransition(async () => {
      const result = await archiveMemberAction(details.id);
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      onArchived(result.message);
      closeDialog();
    });
  }

  return (
    <dialog
      ref={dialogRef}
      className="drawer-dialog"
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      aria-labelledby="member-drawer-title"
    >
      <div className="drawer-dialog__inner">
        <header className="drawer-header">
          <div className="drawer-person">
            <span className="avatar" aria-hidden="true">
              {details?.name.slice(0, 1).toUpperCase() ?? "…"}
            </span>
            <div>
              <h2 id="member-drawer-title">{details?.name ?? d.loadingTitle}</h2>
              {details ? <StatusBadge status={details.status} dict={dict} /> : null}
            </div>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={closeDialog}
            aria-label={d.close}
          >
            <CloseIcon />
          </button>
        </header>

        <div className="drawer-body">
          {loading ? (
            <div className="drawer-loading">
              <div>
                <div className="spinner" />
                {d.loading}
              </div>
            </div>
          ) : error ? (
            <div className="form-alert form-alert--error" role="alert">
              {error}
            </div>
          ) : details ? (
            <>
              <div className="drawer-actions">
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() =>
                    onRecord({
                      id: details.id,
                      name: details.name,
                      lastConfessionDate: details.lastConfessionDate,
                      nextDueDate: details.nextDueDate,
                      today: details.today,
                      dateFormat: details.dateFormat,
                    })
                  }
                >
                  <CheckIcon /> {d.record}
                </button>
                <Link className="button button--secondary" href={`/members/${details.id}/edit`}>
                  <EditIcon /> {d.edit}
                </Link>
              </div>

              {/* The same controls as the roster row and the attention queue,
                  sized up for a panel. This is the surface most likely to be
                  handed to somebody at the church door, which is why it is the
                  one place the reminder's wording would be one press from leaving
                  with them — and why the server, not this component, decides who
                  is offered it. */}
              <div className="drawer-contact-actions">
                <FollowUpActions
                  member={details}
                  variant="button"
                  dateFormat={details.dateFormat}
                  locale={locale}
                  dict={dict}
                />
              </div>

              <section className="detail-grid" aria-label={d.summary}>
                <div className="detail-item">
                  <span>{d.phone}</span>
                  <strong>{details.phone ?? dict.members.noPhoneLong}</strong>
                </div>
                <div className="detail-item">
                  <span>{d.interval}</span>
                  <strong>
                    {formatPlural(details.effectiveIntervalDays, locale, dict.days)}
                  </strong>
                  <small>{details.hasCustomInterval ? d.customInterval : d.systemDefault}</small>
                </div>
                <div className="detail-item">
                  <span>{d.last}</span>
                  <strong>
                    {formatDate(
                      details.lastConfessionDate,
                      details.dateFormat,
                      locale,
                      dict.dates.noRecord,
                    )}
                  </strong>
                </div>
                <div className="detail-item">
                  <span>{d.nextDue}</span>
                  <strong>
                    {formatDate(
                      details.nextDueDate,
                      details.dateFormat,
                      locale,
                      dict.dates.noRecord,
                    )}
                  </strong>
                </div>
                <div className="detail-item">
                  <span>{d.daysSince}</span>
                  <strong>
                    {details.daysSinceLastConfession === null
                      ? dict.common.none
                      : formatNumber(details.daysSinceLastConfession, locale)}
                  </strong>
                </div>
                <div className="detail-item">
                  <span>{d.daysRemaining}</span>
                  <strong>
                    {details.daysRemaining === null
                      ? dict.common.none
                      : fill(dict.phrases.overdue, {
                          days: formatPlural(
                            Math.abs(details.daysRemaining),
                            locale,
                            dict.days,
                          ),
                        })}
                  </strong>
                </div>
                {details.administrativeNote ? (
                  <div className="detail-item detail-item--full">
                    <span>{d.note}</span>
                    <strong>{details.administrativeNote}</strong>
                  </div>
                ) : null}
              </section>

              <section className="drawer-section">
                <div className="drawer-section__heading">
                  <h3>{d.history}</h3>
                  <span>
                    {fill(dict.phrases.daysCount, {
                      count: formatNumber(details.history.length, locale),
                    })}
                  </span>
                </div>
                {details.history.length ? (
                  <ol className="history-list">
                    {details.history.map((record) => (
                      <li key={record.id}>
                        {formatDate(
                          record.confessionDate,
                          details.dateFormat,
                          locale,
                          dict.dates.noRecord,
                        )}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="form-alert">{d.historyEmpty}</div>
                )}
              </section>

              <div className="drawer-privacy">
                <ShieldIcon />
                <span>{d.historyPrivacy}</span>
              </div>

              {canManageLifecycle ? (
                <div className="drawer-danger">
                  <p>{d.archiveWarning}</p>
                  <button
                    className="button button--danger button--small"
                    type="button"
                    onClick={handleArchive}
                    disabled={pending}
                  >
                    <ArchiveIcon /> {pending ? d.archivePending : d.archive}
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
