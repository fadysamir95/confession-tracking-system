"use client";

import { useState } from "react";
import type { MemberStatus } from "@/lib/constants";
import { formatDate, type SupportedDateFormat } from "@/lib/dates";
import type { Dictionary } from "@/lib/dictionaries/en";
import { fill, formatPlural, type Locale } from "@/lib/i18n";
import type { DashboardMember } from "@/lib/member-view-types";
import { BellIcon, CheckIcon, ExternalLinkIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  RecordConfessionDialog,
  type RecordTarget,
} from "@/components/members/record-confession-dialog";
import { useDashboardFeedback } from "@/components/dashboard/dashboard-feedback";
import { useMemberFilter } from "@/components/dashboard/member-filter-context";

/**
 * The three attention lists share one phrase per status rather than each
 * building its own sentence, so a status cannot end up reading one way in the
 * card and another way in the filter chip.
 */
const EMPTY_BY_STATUS = {
  OVERDUE: "emptyOverdue",
  DUE_SOON: "emptyDueSoon",
  NEVER_RECORDED: "emptyNeverRecorded",
} as const;

function remainingLabel(
  member: DashboardMember,
  locale: Locale,
  dict: Dictionary,
): string {
  if (member.status === "OVERDUE") {
    return fill(dict.phrases.overdue, {
      days: formatPlural(member.daysOverdue, locale, dict.days),
    });
  }
  if (member.status === "DUE_SOON" && member.daysRemaining !== null) {
    return fill(dict.phrases.dueIn, {
      days: formatPlural(member.daysRemaining, locale, dict.days),
    });
  }
  return dict.dashboard.attention.noAttendanceDate;
}

export function AttentionSection({
  title,
  description,
  status,
  members,
  dateFormat,
  today,
  locale,
  dict,
}: {
  title: string;
  description: string;
  status: MemberStatus;
  members: DashboardMember[];
  dateFormat: SupportedDateFormat;
  today: string;
  locale: Locale;
  dict: Dictionary;
}) {
  const showMessage = useDashboardFeedback();
  const { goToFilter } = useMemberFilter();
  const [recordTarget, setRecordTarget] = useState<RecordTarget | null>(null);

  function targetFor(member: DashboardMember): RecordTarget {
    return {
      id: member.id,
      name: member.name,
      lastConfessionDate: member.lastConfessionDate,
      nextDueDate: member.nextDueDate,
      today,
      dateFormat,
    };
  }

  return (
    <section className={`attention-card attention-card--${status.toLowerCase()}`}>
      <div className="attention-card__header">
        <div>
          <div className="attention-card__title-row">
            <span className="attention-card__indicator" aria-hidden="true" />
            <h3>{title}</h3>
            <span className="count-pill">{members.length}</span>
          </div>
          <p>{description}</p>
        </div>
        {/* A button, not a link to `/?filter=…#members`.

            The link did work — the page read the parameter and the anchor
            scrolled — so this is not a fix for something broken. It is what it
            cost: a whole document request to rebuild a roster the browser
            already had, discarding the search text, the sort, and the page the
            reader was on. Setting the shared filter and scrolling to it is the
            same result without the round trip. */}
        <button
          type="button"
          className="text-link text-link--button"
          onClick={() => goToFilter(status)}
        >
          {dict.common.viewAll}
        </button>
      </div>

      {members.length ? (
        <ul className="attention-list">
          {members.map((member) => (
            <li key={member.id}>
              <div className="attention-person">
                <span className="avatar avatar--small" aria-hidden="true">
                  {member.name.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <strong>{member.name}</strong>
                  <span>
                    {status === "NEVER_RECORDED"
                      ? dict.dashboard.attention.noConfessionDate
                      : fill(dict.phrases.lastPrefix, {
                          date: formatDate(
                            member.lastConfessionDate,
                            dateFormat,
                            locale,
                            dict.dates.noRecord,
                          ),
                        })}
                  </span>
                </div>
              </div>
              <div className="attention-meta">
                <span className="attention-meta__label">
                  {remainingLabel(member, locale, dict)}
                </span>
                <div className="attention-actions">
                  {/* Only the overdue queue gets the reminder. The saved template
                      names how many days late someone is, which is a thing to say
                      to a person who *is* late and nothing to say to anyone
                      else — the due-soon and never-recorded members would be
                      told they are zero days overdue. */}
                  {member.reminderUrl ? (
                    <a
                      className="icon-button"
                      href={member.reminderUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={fill(dict.members.remindLabel, { name: member.name })}
                      title={dict.members.remindTooltip}
                    >
                      <BellIcon />
                    </a>
                  ) : null}
                  {member.whatsappUrl ? (
                    <a
                      className="icon-button"
                      href={member.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={fill(dict.members.whatsappLabel, { name: member.name })}
                      title={dict.members.whatsappTooltip}
                    >
                      <ExternalLinkIcon />
                    </a>
                  ) : null}
                  <button
                    className="button button--small button--secondary"
                    type="button"
                    onClick={() => setRecordTarget(targetFor(member))}
                  >
                    <CheckIcon /> {dict.dashboard.attention.record}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="attention-empty">
          <StatusBadge status={status} dict={dict} />
          <p>{dict.dashboard.attention[EMPTY_BY_STATUS[status as keyof typeof EMPTY_BY_STATUS]]}</p>
        </div>
      )}

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
