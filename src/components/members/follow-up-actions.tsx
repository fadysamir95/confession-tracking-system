"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { BellIcon, ClockIcon, CloseIcon, ExternalLinkIcon } from "@/components/ui/icons";
import type { MemberStatus } from "@/lib/constants";
import { EXTENSION_PRESETS } from "@/lib/constants";
import { formatDate, type SupportedDateFormat } from "@/lib/dates";
import type { Dictionary } from "@/lib/dictionaries/en";
import { fill, formatPlural, type Locale } from "@/lib/i18n";
import { useDashboardFeedback } from "@/components/dashboard/dashboard-feedback";
import {
  extendMemberAction,
  markReminderSentAction,
  undoExtensionAction,
} from "@/app/actions/member-actions";

/**
 * The parts of a member this component needs.
 *
 * Spelled out rather than taking a `DashboardMember`, because the three surfaces
 * that render these controls hold different things — the roster row has a
 * projected member, the attention queue has one from a filtered list, the drawer
 * has one fetched on demand — and a shared type is what stops the argument list
 * from drifting apart between them. It is also the smallest list of fields that
 * can answer every question asked here, which is the test for whether a
 * component is being handed what it uses.
 */
export interface FollowUpTarget {
  id: string;
  name: string;
  status: MemberStatus;
  /** Present only for a member past the limit. The server decides. */
  reminderUrl: string | null;
  whatsappUrl: string | null;
  /** The day the reminder was last opened, or `null`. */
  reminderSentOn: string | null;
  /** The grace in force today, or `null` when there is none or it has run out. */
  activeExtension: string | null;
  nextDueDate: string | null;
}

/**
 * What to do about somebody who is past their limit, and the record of what has
 * already been done.
 *
 * One component for all three surfaces, because these two controls answer one
 * question — *what do I do about this person* — and three hand-written copies of
 * that answer is three chances for the queue to offer a reminder the drawer
 * hides, or for the row to show an extension the drawer cannot take back. The
 * only thing that varies is how big the controls are, which is what `variant` is
 * for.
 */
export function FollowUpActions({
  member,
  variant = "icon",
  dateFormat,
  locale,
  dict,
}: {
  member: FollowUpTarget;
  variant?: "icon" | "button";
  dateFormat: SupportedDateFormat;
  locale: Locale;
  dict: Dictionary;
}) {
  const showMessage = useDashboardFeedback();
  const [, startMarking] = useTransition();
  const [extending, startExtending] = useTransition();

  const m = dict.members;
  const on = variant === "button";

  /**
   * Record the opening, then let the browser follow the link.
   *
   * Deliberately not `preventDefault`ed and not awaited: the priest's next
   * action is composing a message, and the marker is bookkeeping about a
   * message that is already on its way. `revalidatePath` in the action brings
   * the roster back with the marker set, so it reappears without this component
   * holding a second copy of the truth that could disagree with the server's.
   */
  function markSent() {
    startMarking(() => {
      void markReminderSentAction(member.id);
    });
  }

  const extend = (days: number) =>
    startExtending(async () => {
      const result = await extendMemberAction({ memberId: member.id, days });
      if (result.ok) showMessage(result.message);
    });

  return (
    <div
      className={`follow-up follow-up--${variant}`}
      data-reminded={member.reminderSentOn ? "yes" : "no"}
    >
      {member.reminderUrl ? (
        <a
          className={`follow-up__remind${member.reminderSentOn ? " is-reminded" : ""}`}
          href={member.reminderUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={markSent}
          title={
            member.reminderSentOn
              ? fill(m.remindedTooltip, {
                  date: formatDate(member.reminderSentOn, dateFormat, locale),
                })
              : m.remindTooltip
          }
          aria-label={
            member.reminderSentOn
              ? fill(m.remindedOn, {
                  name: member.name,
                  date: formatDate(member.reminderSentOn, dateFormat, locale),
                })
              : fill(m.remindLabel, { name: member.name })
          }
        >
          <BellIcon />
          {on ? <span>{member.reminderSentOn ? m.remindAgain : m.remind}</span> : null}
          {on && member.reminderSentOn ? (
            <span className="follow-up__flag">{m.remindedShort}</span>
          ) : null}
        </a>
      ) : null}

      {member.whatsappUrl ? (
        <a
          className="follow-up__whatsapp"
          href={member.whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={m.whatsappTooltip}
          aria-label={fill(m.whatsappLabel, { name: member.name })}
        >
          <ExternalLinkIcon />
          {on ? <span>{m.whatsapp}</span> : null}
        </a>
      ) : null}

      {/*
          A grace in force outranks the button that would create one, and it says
          when it ends. Without that, granting time is invisible until the priest
          looks at the due date and does the subtraction themselves, and the
          single question "is this person still being chased" has no answer on
          the screen. */}
      {member.activeExtension ? (
        <span className="follow-up__grace">
          <ClockIcon />
          <span>
            {fill(m.extendedUntil, {
              date: formatDate(member.activeExtension, dateFormat, locale),
            })}
          </span>
          <button
            type="button"
            className="follow-up__undo"
            onClick={() =>
              startExtending(async () => {
                const result = await undoExtensionAction(member.id);
                if (result.ok) showMessage(result.message);
              })
            }
            disabled={extending}
            title={m.undoExtension}
            aria-label={fill(m.undoExtensionLabel, { name: member.name })}
          >
            <CloseIcon />
          </button>
        </span>
      ) : member.status === "OVERDUE" ? (
        <ExtendMenu
          disabled={extending}
          onExtend={extend}
          label={on ? m.extend : undefined}
          tooltip={m.extendTooltip}
          menuLabel={m.extendMenu}
          dict={dict}
          locale={locale}
        />
      ) : null}
    </div>
  );
}

/**
 * The preset lengths, behind a button.
 *
 * A menu rather than three buttons because a roster row already carries a
 * reminder, a chat, an edit and a record; three more buttons beside each of
 * fifteen rows would bury the one the priest came for. Behind one control the
 * three lengths are still one tap away, and the row stays readable on a phone.
 *
 * Written out longhand rather than with a generic popover because there is no
 * generic popover to reuse, and the behaviour that makes a menu usable is
 * exactly the part a wrapper tends to leave out: Escape to dismiss, a click
 * outside to dismiss, and `aria-expanded` so the state is not carried by the
 * arrow alone.
 */
function ExtendMenu({
  disabled,
  onExtend,
  label,
  tooltip,
  menuLabel,
  dict,
  locale,
}: {
  disabled: boolean;
  onExtend: (days: number) => void;
  label?: string;
  tooltip: string;
  menuLabel: string;
  dict: Dictionary;
  locale: Locale;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="extend-menu" ref={containerRef}>
      <button
        type="button"
        className="icon-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((was) => !was)}
        title={tooltip}
        aria-label={tooltip}
      >
        <ClockIcon />
        {label ? <span className="extend-menu__label">{label}</span> : null}
      </button>

      {open ? (
        <div className="extend-menu__list" id={menuId} role="menu" aria-label={menuLabel}>
          {EXTENSION_PRESETS.map((days) => (
            <button
              key={days}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onExtend(days);
              }}
            >
              {formatPlural(days, locale, dict.days)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
