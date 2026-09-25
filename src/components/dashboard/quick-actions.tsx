"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { searchMembers } from "@/lib/member-filters";
import type { DashboardMember } from "@/lib/member-view-types";
import { formatDate, type SupportedDateFormat } from "@/lib/dates";
import type { Dictionary } from "@/lib/dictionaries/en";
import { fill, formatNumber, intlLocale, type Locale } from "@/lib/i18n";
import { getInitials } from "@/lib/utils";
import { CheckIcon, CloseIcon, ImportIcon, PlusIcon, SearchIcon } from "@/components/ui/icons";
import {
  RecordConfessionDialog,
  type RecordTarget,
} from "@/components/members/record-confession-dialog";
import { useDashboardFeedback } from "@/components/dashboard/dashboard-feedback";
import { useMemberFilter } from "@/components/dashboard/member-filter-context";

export function QuickActions({
  members,
  today,
  dateFormat,
  overdueCount,
  dueSoonCount,
  locale,
  dict,
}: {
  members: DashboardMember[];
  today: string;
  dateFormat: SupportedDateFormat;
  overdueCount: number;
  dueSoonCount: number;
  locale: Locale;
  dict: Dictionary;
}) {
  const showMessage = useDashboardFeedback();
  const { goToFilter } = useMemberFilter();
  const pickerRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [recordTarget, setRecordTarget] = useState<RecordTarget | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const q = dict.dashboard.quick;

  const results = useMemo(
    () => searchMembers(sortForQuickRecord(members, locale), query, locale).slice(0, 12),
    [members, query, locale],
  );

  useEffect(() => {
    if (pickerOpen) searchRef.current?.focus();
  }, [pickerOpen]);

  function openPicker() {
    setPickerOpen(true);
    pickerRef.current?.showModal();
  }

  function closePicker() {
    pickerRef.current?.close();
  }

  function selectMember(member: DashboardMember) {
    closePicker();
    setRecordTarget({
      id: member.id,
      name: member.name,
      lastConfessionDate: member.lastConfessionDate,
      nextDueDate: member.nextDueDate,
      today,
      dateFormat,
    });
  }

  return (
    <section className="quick-actions" aria-label={q.label}>
      <div className="quick-actions__intro">
        <p className="eyebrow">{q.eyebrow}</p>
        <h2>{q.title}</h2>
      </div>
      <div className="quick-actions__buttons">
        <Link className="quick-action" href="/members/new">
          <span className="quick-action__icon">
            <PlusIcon />
          </span>
          <span>
            <strong>{q.addMember}</strong>
            <small>{q.addMemberBody}</small>
          </span>
        </Link>
        <Link className="quick-action" href="/members/import">
          <span className="quick-action__icon">
            <ImportIcon />
          </span>
          <span>
            <strong>{q.importMembers}</strong>
            <small>{q.importMembersBody}</small>
          </span>
        </Link>
        <button className="quick-action" type="button" onClick={openPicker}>
          <span className="quick-action__icon">
            <CheckIcon />
          </span>
          <span>
            <strong>{q.record}</strong>
            <small>{q.recordBody}</small>
          </span>
        </button>
        <Link className="quick-action" href="/?focus=1#members">
          <span className="quick-action__icon">
            <SearchIcon />
          </span>
          <span>
            <strong>{q.search}</strong>
            <small>{q.searchBody}</small>
          </span>
        </Link>
        <button
          className="quick-action quick-action--count quick-action--button"
          type="button"
          onClick={() => goToFilter("OVERDUE")}
        >
          <span>
            <strong>{q.viewOverdue}</strong>
            <small>{q.viewOverdueBody}</small>
          </span>
          <b>{formatNumber(overdueCount, locale)}</b>
        </button>
        <button
          className="quick-action quick-action--count quick-action--button"
          type="button"
          onClick={() => goToFilter("DUE_SOON")}
        >
          <span>
            <strong>{q.viewDueSoon}</strong>
            <small>{q.viewDueSoonBody}</small>
          </span>
          <b>{formatNumber(dueSoonCount, locale)}</b>
        </button>
      </div>

      <dialog
        ref={pickerRef}
        className="member-picker-dialog"
        onClose={() => setPickerOpen(false)}
        onCancel={(event) => {
          event.preventDefault();
          closePicker();
        }}
        aria-labelledby="member-picker-title"
      >
        <div className="member-picker__header">
          <div>
            <p className="eyebrow">{q.dialogEyebrow}</p>
            <h2 id="member-picker-title">{q.dialogTitle}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={closePicker}
            aria-label={q.close}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="member-picker__search">
          <SearchIcon />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={q.placeholder}
            aria-label={q.searchLabel}
          />
        </div>
        <div className="member-picker__results">
          {results.length ? (
            results.map((member) => (
              <button key={member.id} type="button" onClick={() => selectMember(member)}>
                <span className="avatar avatar--small">{getInitials(member.name)}</span>
                <span className="member-picker__person">
                  <strong>{member.name}</strong>
                  <small>
                    {fill(dict.phrases.lastPrefix, {
                      date: formatDate(
                        member.lastConfessionDate,
                        dateFormat,
                        locale,
                        dict.dates.noRecord,
                      ),
                    })}
                    {member.phone ? ` · ${member.phone}` : ""}
                  </small>
                </span>
                <span className="member-picker__arrow">→</span>
              </button>
            ))
          ) : (
            <p className="member-picker__empty">{q.empty}</p>
          )}
        </div>
      </dialog>

      <RecordConfessionDialog
        target={recordTarget}
        onClose={() => setRecordTarget(null)}
        onRecorded={showMessage}
        locale={locale}
        dict={dict}
      />
    </section>
  );
}

function sortForQuickRecord(members: DashboardMember[], locale: Locale) {
  return [...members].sort((left, right) => {
    const leftValue = left.lastConfessionDate ?? "0000-00-00";
    const rightValue = right.lastConfessionDate ?? "9999-99-99";
    return (
      leftValue.localeCompare(rightValue) ||
      left.name.localeCompare(right.name, intlLocale(locale))
    );
  });
}
