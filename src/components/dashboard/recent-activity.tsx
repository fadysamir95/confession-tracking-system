import { formatDate, type SupportedDateFormat } from "@/lib/dates";
import type { Dictionary } from "@/lib/dictionaries/en";
import type { Locale } from "@/lib/i18n";
import { getInitials } from "@/lib/utils";

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
  return (
    <section className="surface-card recent-card">
      <div className="recent-card__header">
        <div>
          <h2>{dict.dashboard.recent.title}</h2>
          <p>{dict.dashboard.recent.body}</p>
        </div>
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
