import { formatDateTime } from "@/lib/dates";
import type { Dictionary } from "@/lib/dictionaries/en";
import type { Locale } from "@/lib/i18n";

/**
 * Audit action names are a closed set in `AUDIT_ACTIONS`, but the trail also
 * carries rows written before a rename, and a table that shows nothing for an
 * unrecognised action is a table that looks broken. Anything the dictionary
 * does not name falls back to `unknownAction` rather than to a raw enum value.
 */
function actionLabel(action: string, dict: Dictionary): string {
  const known = dict.audit.actions as Record<string, string | undefined>;
  return known[action] ?? dict.audit.unknownAction;
}

export function AuditLog({
  entries,
  timezone,
  locale,
  dict,
}: {
  entries: Array<{
    id: string;
    action: string;
    memberId: string | null;
    createdAt: string;
    user: { name: string } | null;
  }>;
  timezone: string;
  locale: Locale;
  dict: Dictionary;
}) {
  return (
    <section className="surface-card audit-card">
      <div className="settings-section__header">
        <div>
          <h2>{dict.audit.title}</h2>
          <p>{dict.audit.body}</p>
        </div>
      </div>
      {entries.length ? (
        <div className="audit-table-wrap">
          <table className="audit-table">
            <thead>
              <tr>
                <th>{dict.audit.colAction}</th>
                <th>{dict.audit.colUser}</th>
                <th>{dict.audit.colMember}</th>
                <th>{dict.audit.colTime}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{actionLabel(entry.action, dict)}</td>
                  <td>{entry.user?.name ?? dict.audit.formerUser}</td>
                  <td>
                    <code>{entry.memberId ? `${entry.memberId.slice(0, 10)}…` : "—"}</code>
                  </td>
                  <td>{formatDateTime(entry.createdAt, timezone, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="audit-empty">{dict.audit.empty}</p>
      )}
    </section>
  );
}
