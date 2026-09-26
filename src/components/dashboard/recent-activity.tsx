"use client";

import { useSyncExternalStore } from "react";
import { formatDate, type SupportedDateFormat } from "@/lib/dates";
import {
  isRecentCardHidden,
  setRecentCardHidden,
  subscribeRecentCard,
} from "@/lib/recent-card";
import type { Dictionary } from "@/lib/dictionaries/en";
import type { Locale } from "@/lib/i18n";
import { getInitials } from "@/lib/utils";
import { CloseIcon } from "@/components/ui/icons";

/**
 * The six most recent attendance dates.
 *
 * "Clear all" on this card **hides** it and deletes nothing. That is a
 * deliberate limit on what the control does, and it is worth being explicit
 * about why: the six entries are not a list the app owns, they are six real
 * confession dates read out of the database. Any control that emptied this card
 * would be deleting attendance history — the one thing in this product that
 * cannot be reconstructed, entered by hand, date by date, over years. A
 * dashboard button is the wrong place to put that, and a confirmation dialog
 * does not make it the right place, it only makes it a slightly less easy
 * mistake.
 *
 * So the dismissal is reversible, and the way back sits where the card was
 * rather than in settings.
 *
 * The card is server-rendered, and the guard script in the document head has
 * already set `data-recent="hidden"` on `<html>` when it is dismissed, so the
 * first paint is correct and the card never flashes. The store read below
 * arrives just after hydration and only decides whether the restore link is
 * showing.
 */
export function RecentActivity({
  records,
  dateFormat,
  locale,
  dict,
}: {
  records: Array<{ memberId: string; name: string; confessionDate: string }>;
  dateFormat: SupportedDateFormat;
  locale: Locale;
  dict: Dictionary;
}) {
  const dismissed = useSyncExternalStore(
    subscribeRecentCard,
    isRecentCardHidden,
    // No storage on the server, so the first render is the card — which is what
    // React hydrates against, and what the stylesheet is already hiding if the
    // key is set.
    () => false,
  );

  if (dismissed) {
    return (
      <p className="recent-card__restore">
        <button
          type="button"
          className="text-link text-link--button"
          onClick={() => setRecentCardHidden(false)}
        >
          {dict.dashboard.recent.restore}
        </button>
      </p>
    );
  }

  return (
    <section className="surface-card recent-card">
      <div className="recent-card__header">
        <div>
          <h2>{dict.dashboard.recent.title}</h2>
          <p>{dict.dashboard.recent.body}</p>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={() => setRecentCardHidden(true)}
          title={dict.dashboard.recent.clearAll}
          aria-label={dict.dashboard.recent.clearAllLabel}
        >
          <CloseIcon />
        </button>
      </div>
      {records.length ? (
        <ul>
          {records.map((record) => (
            <li key={`${record.memberId}-${record.confessionDate}`}>
              <span className="avatar avatar--small" aria-hidden="true">
                {getInitials(record.name)}
              </span>
              <div>
                <strong>{record.name}</strong>
                <span>
                  {formatDate(
                    record.confessionDate,
                    dateFormat,
                    locale,
                    dict.dates.noRecord,
                  )}
                </span>
              </div>
              <span className="recent-card__check" aria-label={dict.dashboard.recent.recorded}>
                ✓
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="recent-card__empty">{dict.dashboard.recent.empty}</p>
      )}
    </section>
  );
}
