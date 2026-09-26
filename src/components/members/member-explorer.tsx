"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDate, type SupportedDateFormat } from "@/lib/dates";
import {
  filterMembers,
  filterLabel,
  getMemberCounts,
  MEMBER_FILTERS,
  MEMBER_SORTS,
  searchMembers,
  sortLabel,
  sortMembers,
} from "@/lib/member-filters";
import type { Dictionary } from "@/lib/dictionaries/en";
import { fill, formatNumber, formatPlural, type Locale } from "@/lib/i18n";
import type { DashboardMember } from "@/lib/member-view-types";
import { getInitials } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  EditIcon,
  SearchIcon,
} from "@/components/ui/icons";
import { MemberDrawer } from "@/components/members/member-drawer";
import { FollowUpActions } from "@/components/members/follow-up-actions";
import { useMemberFilter } from "@/components/dashboard/member-filter-context";
import {
  RecordConfessionDialog,
  type RecordTarget,
} from "@/components/members/record-confession-dialog";
import type { MemberFilter } from "@/lib/member-filters";
import { scrollIntoView } from "@/lib/scroll";

const PAGE_SIZE = 15;

function dueDescription(member: DashboardMember, locale: Locale, dict: Dictionary): string {
  if (member.status === "OVERDUE") {
    return fill(dict.phrases.overdue, {
      days: formatPlural(member.daysOverdue, locale, dict.days),
    });
  }
  if (member.status === "NEVER_RECORDED" || member.daysRemaining === null) {
    return dict.dashboard.stats.noRecordBody;
  }
  return fill(dict.phrases.remaining, {
    days: formatPlural(member.daysRemaining, locale, dict.days),
  });
}

function recordTarget(
  member: DashboardMember,
  today: string,
  dateFormat: SupportedDateFormat,
): RecordTarget {
  return {
    id: member.id,
    name: member.name,
    lastConfessionDate: member.lastConfessionDate,
    nextDueDate: member.nextDueDate,
    today,
    dateFormat,
  };
}

export function MemberExplorer({
  members,
  today,
  canManageLifecycle,
  dateFormat,
  autoFocus = false,
  locale,
  dict,
}: {
  members: DashboardMember[];
  today: string;
  canManageLifecycle: boolean;
  dateFormat: SupportedDateFormat;
  autoFocus?: boolean;
  locale: Locale;
  dict: Dictionary;
}) {
  const { filter, setFilter } = useMemberFilter();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<(typeof MEMBER_SORTS)[number]>("ATTENTION");
  const [recordTargetState, setRecordTargetState] = useState<RecordTarget | null>(null);
  const [drawerMemberId, setDrawerMemberId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const m = dict.members;

  /* The current page, remembered together with the filter it belongs to.
     A page number is only meaningful relative to the list it was cut from, so
     the two are stored as one value rather than as two that have to be kept in
     step.

     The reset is done during render, not in an effect, and that is not a style
     choice. The filter can be changed from outside this component — that is
     what the attention queues do — so a reset at the call sites cannot be
     exhaustive. React's documented way to adjust state that a change has just
     invalidated is to do it while rendering: it re-runs this component
     immediately with the corrected value and never paints the stale one.

     An effect would paint first. For a reader on page 3 who chooses "Overdue"
     from a queue above, and the result has one page, that first paint is an
     empty table with a page indicator reading "Page 3 of 1". */
  const [pagination, setPagination] = useState({ filter, page: 1 });
  if (pagination.filter !== filter) {
    setPagination({ filter, page: 1 });
  }
  const page = pagination.page;

  const resetToFirstPage = useCallback(() => {
    setPagination({ filter, page: 1 });
  }, [filter]);

  const goToPage = useCallback(
    (next: number) => {
      setPagination({ filter, page: next });
    },
    [filter],
  );

  const counts = useMemo(() => getMemberCounts(members), [members]);
  const visibleMembers = useMemo(
    () =>
      sortMembers(
        filterMembers(searchMembers(members, query, locale), filter),
        sort,
        locale,
      ),
    [members, query, filter, sort, locale],
  );
  const pageCount = Math.max(1, Math.ceil(visibleMembers.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageMembers = visibleMembers.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  useEffect(() => {
    if (autoFocus) searchInputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 4_500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const filterCounts: Record<MemberFilter, number> = {
    ALL: counts.total,
    ACTIVE: counts.active,
    DUE_SOON: counts.dueSoon,
    OVERDUE: counts.overdue,
    NEVER_RECORDED: counts.neverRecorded,
    NO_PHONE: counts.noPhone,
  };

  const pageLabel = fill(m.pageOf, {
    current: formatNumber(currentPage, locale),
    total: formatNumber(pageCount, locale),
  });

  return (
    <section className="members-section" id="members" aria-labelledby="members-heading">
      <div className="section-heading members-section__heading">
        <div>
          <h2 id="members-heading">{m.heading}</h2>
          <p>{m.body}</p>
        </div>
        <button
          type="button"
          className="keyboard-hint"
          aria-label={m.searchShortcutLabel}
          onClick={() => {
            const input = searchInputRef.current;
            if (!input) return;
            input.focus();
            scrollIntoView(input, "center");
          }}
        >
          {m.searchShortcutLead} <kbd dir="ltr">/</kbd> {m.searchShortcutTrail}
        </button>
      </div>

      <div className="surface-card members-card">
        <div className="members-toolbar">
          <div className="search-control">
            <SearchIcon />
            <input
              ref={searchInputRef}
              data-member-search
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                resetToFirstPage();
              }}
              placeholder={m.searchPlaceholder}
              aria-label={m.searchLabel}
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  resetToFirstPage();
                }}
                aria-label={m.clearSearch}
              >
                <CloseIcon />
              </button>
            ) : null}
          </div>
          <div className="sort-control">
            <label htmlFor="member-sort">{m.sort}</label>
            <select
              id="member-sort"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as typeof sort);
                resetToFirstPage();
              }}
            >
              {MEMBER_SORTS.map((option) => (
                <option key={option} value={option}>
                  {sortLabel(option, dict)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="filter-bar" aria-label={m.filterGroup}>
          {MEMBER_FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              className={filter === item ? "is-active" : ""}
              onClick={() => setFilter(item)}
              aria-pressed={filter === item}
            >
              {filterLabel(item, dict)}{" "}
              <span>{formatNumber(filterCounts[item], locale)}</span>
            </button>
          ))}
        </div>

        <div className="members-result-summary" aria-live="polite">
          <span>
            {query
              ? fill(dict.phrases.resultCountMatching, {
                  count: formatNumber(visibleMembers.length, locale),
                  noun: formatPlural(visibleMembers.length, locale, dict.nouns.member),
                  query,
                })
              : formatPlural(visibleMembers.length, locale, dict.nouns.member)}
          </span>
          <span>{pageLabel}</span>
        </div>

        {pageMembers.length ? (
          <>
            <div className="members-table-wrap">
              <table className="members-table">
                <thead>
                  <tr>
                    <th>{m.columns.name}</th>
                    <th>{m.columns.phone}</th>
                    <th>{m.columns.last}</th>
                    <th>{m.columns.since}</th>
                    <th>{m.columns.limit}</th>
                    <th>{m.columns.nextDue}</th>
                    <th>{m.columns.status}</th>
                    <th>
                      <span className="visually-hidden">{m.columns.actions}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageMembers.map((member) => (
                    <tr
                      key={member.id}
                      className={member.status === "OVERDUE" ? "is-overdue" : ""}
                    >
                      <td>
                        <button
                          className="member-name-button"
                          type="button"
                          onClick={() => setDrawerMemberId(member.id)}
                        >
                          <span className="avatar avatar--small" aria-hidden="true">
                            {getInitials(member.name)}
                          </span>
                          <span>{member.name}</span>
                        </button>
                      </td>
                      <td>
                        {member.phone ? (
                          <a className="phone-link" href={`tel:${member.phone}`}>
                            {member.phone}
                          </a>
                        ) : (
                          <span className="muted-value">{m.noPhone}</span>
                        )}
                      </td>
                      <td>
                        {formatDate(
                          member.lastConfessionDate,
                          dateFormat,
                          locale,
                          dict.dates.noRecord,
                        )}
                      </td>
                      <td>
                        {member.daysSinceLastConfession === null
                          ? dict.common.none
                          : formatPlural(
                              member.daysSinceLastConfession,
                              locale,
                              dict.days,
                            )}
                      </td>
                      <td>
                        <span className="limit-value">
                          {formatPlural(member.effectiveIntervalDays, locale, dict.days)}
                        </span>
                        {member.hasCustomInterval ? <small>{m.custom}</small> : null}
                      </td>
                      <td>
                        {formatDate(
                          member.nextDueDate,
                          dateFormat,
                          locale,
                          dict.dates.noRecord,
                        )}
                      </td>
                      <td>
                        <StatusBadge status={member.status} dict={dict} />
                        <small className="due-description">
                          {dueDescription(member, locale, dict)}
                        </small>
                      </td>
                      <td>
                        <div className="row-actions">
                          {/* The reminder states how many days late the member
                              is, so it is only offered to someone who is late;
                              the bare chat link is for everyone else, and for
                              them too when the priest would rather write it.
                              Both, plus the extension, are decided in one place
                              and arrive already filtered — the server has
                              already refused the reminder to a member within
                              their limit, so the row carries nothing it should
                              not. See `shouldOfferReminder`. */}
                          <FollowUpActions
                            member={member}
                            dateFormat={dateFormat}
                            locale={locale}
                            dict={dict}
                          />
                          <button
                            className="icon-button"
                            type="button"
                            onClick={() => setDrawerMemberId(member.id)}
                            title={m.viewTooltip}
                            aria-label={fill(m.viewLabel, { name: member.name })}
                          >
                            <EditIcon />
                          </button>
                          <button
                            className="button button--small button--primary"
                            type="button"
                            onClick={() =>
                              setRecordTargetState(recordTarget(member, today, dateFormat))
                            }
                          >
                            <CheckIcon /> {m.record}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="member-cards" aria-label={m.heading}>
              {pageMembers.map((member) => (
                <article
                  className={`member-card member-card--${member.status.toLowerCase()}`}
                  key={member.id}
                >
                  <div className="member-card__header">
                    <button type="button" onClick={() => setDrawerMemberId(member.id)}>
                      <span className="avatar" aria-hidden="true">
                        {getInitials(member.name)}
                      </span>
                      <span>
                        <strong>{member.name}</strong>
                        <small>{member.phone ?? m.noPhoneLong}</small>
                      </span>
                    </button>
                    <StatusBadge status={member.status} dict={dict} />
                  </div>
                  <div className="member-card__metrics">
                    <div>
                      <span>{m.drawer.last}</span>
                      <strong>
                        {formatDate(
                          member.lastConfessionDate,
                          dateFormat,
                          locale,
                          dict.dates.noRecord,
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>{m.drawer.nextDue}</span>
                      <strong>
                        {formatDate(
                          member.nextDueDate,
                          dateFormat,
                          locale,
                          dict.dates.noRecord,
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>{m.cardTime}</span>
                      <strong>{dueDescription(member, locale, dict)}</strong>
                    </div>
                    <div>
                      <span>{m.columns.limit}</span>
                      <strong>
                        {formatPlural(member.effectiveIntervalDays, locale, dict.days)}
                      </strong>
                    </div>
                  </div>
                  <div className="member-card__actions">
                    {/* The mobile card. Same component as the table row, sized up
                        — see the note there for why the rules live in one place. */}
                    <FollowUpActions
                      member={member}
                      variant="button"
                      dateFormat={dateFormat}
                      locale={locale}
                      dict={dict}
                    />
                    <button
                      className="button button--primary"
                      type="button"
                      onClick={() =>
                        setRecordTargetState(recordTarget(member, today, dateFormat))
                      }
                    >
                      <CheckIcon /> {m.recordConfession}
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <div className="pagination">
              <button
                className="button button--secondary button--small"
                type="button"
                onClick={() => goToPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeftIcon /> {dict.common.previous}
              </button>
              <span>{pageLabel}</span>
              <button
                className="button button--secondary button--small"
                type="button"
                onClick={() => goToPage(Math.min(pageCount, currentPage + 1))}
                disabled={currentPage === pageCount}
              >
                {dict.common.next} <ChevronRightIcon />
              </button>
            </div>
          </>
        ) : (
          <EmptyState
            title={query ? m.emptyTitleQuery : m.emptyTitleNoQuery}
            description={query ? m.emptyBodyQuery : m.emptyBodyNoQuery}
            action={
              query || filter !== "ALL" ? (
                <button
                  className="button button--secondary button--small"
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setFilter("ALL");
                  }}
                >
                  {m.clearAll}
                </button>
              ) : undefined
            }
          />
        )}
      </div>

      <RecordConfessionDialog
        target={recordTargetState}
        onClose={() => setRecordTargetState(null)}
        onRecorded={setToast}
        locale={locale}
        dict={dict}
      />
      <MemberDrawer
        memberId={drawerMemberId}
        canManageLifecycle={canManageLifecycle}
        onClose={() => setDrawerMemberId(null)}
        onRecord={setRecordTargetState}
        onArchived={(message) => {
          setDrawerMemberId(null);
          setToast(message);
        }}
        onMessage={setToast}
        locale={locale}
        dict={dict}
      />
      {toast ? (
        <div className="action-toast" role="status">
          <CheckIcon /> {toast}
        </div>
      ) : null}
    </section>
  );
}
