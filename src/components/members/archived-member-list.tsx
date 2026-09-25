"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDate, formatDateTime, type SupportedDateFormat } from "@/lib/dates";
import type { Dictionary } from "@/lib/dictionaries/en";
import { fill, type Locale } from "@/lib/i18n";
import type { MemberListItem } from "@/lib/member-domain";
import {
  permanentlyDeleteMemberAction,
  restoreMemberAction,
} from "@/app/actions/member-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckIcon, CloseIcon } from "@/components/ui/icons";

export type ArchivedMemberView = MemberListItem & { archivedAt: string | null };

export function ArchivedMemberList({
  members,
  dateFormat,
  timezone,
  locale,
  dict,
}: {
  members: ArchivedMemberView[];
  dateFormat: SupportedDateFormat;
  timezone: string;
  locale: Locale;
  dict: Dictionary;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const a = dict.members.archive;

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(""), 4500);
    return () => window.clearTimeout(timeout);
  }, [message]);

  function restore(member: ArchivedMemberView) {
    if (!window.confirm(fill(a.restoreConfirm, { name: member.name }))) return;
    setPendingId(member.id);
    startTransition(async () => {
      const result = await restoreMemberAction(member.id);
      setMessage(result.message);
      setPendingId(null);
      if (result.ok) router.refresh();
    });
  }

  function permanentlyDelete(member: ArchivedMemberView) {
    // Two prompts on purpose. The first asks for a typed word rather than a
    // yes/no click, because the next step is irreversible; the second asks for
    // the administrator's own password, so a walk-away-from-keyboard cannot
    // delete a parish's records on its own. The confirmation word is the literal
    // string from the dictionary rather than a translation, since it is matched
    // exactly below and a translated word would have to be re-translated back.
    const confirmation = window.prompt(
      fill(a.deletePrompt, { name: member.name, token: a.deleteToken }),
    );
    if (confirmation !== a.deleteToken) return;

    const currentPassword = window.prompt(a.deletePasswordPrompt);
    if (!currentPassword) return;

    setPendingId(member.id);
    startTransition(async () => {
      const result = await permanentlyDeleteMemberAction(member.id, currentPassword);
      setMessage(result.message);
      setPendingId(null);
      if (result.ok) router.refresh();
    });
  }

  if (!members.length) {
    return (
      <div className="surface-card">
        <EmptyState title={a.emptyTitle} description={a.emptyBody} />
      </div>
    );
  }

  return (
    <>
      <div className="surface-card archived-list">
        {members.map((member) => (
          <article key={member.id}>
            <div className="archived-person">
              <span className="avatar" aria-hidden="true">
                {member.name.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <h2>{member.name}</h2>
                <p>{member.phone ?? dict.members.noPhoneLong}</p>
              </div>
            </div>
            <div className="archived-metrics">
              <span>
                {a.last}
                <strong>
                  {formatDate(
                    member.lastConfessionDate,
                    dateFormat,
                    locale,
                    dict.dates.noRecord,
                  )}
                </strong>
              </span>
              <span>
                {a.archived}
                <strong>
                  {member.archivedAt
                    ? formatDateTime(member.archivedAt, timezone, locale)
                    : dict.common.none}
                </strong>
              </span>
            </div>
            <div className="archived-actions">
              <button
                className="button button--secondary button--small"
                type="button"
                onClick={() => restore(member)}
                disabled={pending && pendingId === member.id}
              >
                <CheckIcon /> {a.restore}
              </button>
              <button
                className="button button--danger button--small"
                type="button"
                onClick={() => permanentlyDelete(member)}
                disabled={pending && pendingId === member.id}
              >
                <CloseIcon /> {a.delete}
              </button>
            </div>
          </article>
        ))}
      </div>
      {message ? (
        <div className="action-toast" role="status">
          <CheckIcon /> {message}
        </div>
      ) : null}
    </>
  );
}
