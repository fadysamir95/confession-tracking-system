import Link from "next/link";
import { CalendarIcon, CheckIcon, ClockIcon, SearchIcon, UsersIcon } from "@/components/ui/icons";
import type { Dictionary } from "@/lib/dictionaries/en";
import { formatNumber, type Locale } from "@/lib/i18n";

interface StatCardProps {
  label: string;
  value: number;
  filter: string;
  tone: "neutral" | "active" | "warning" | "danger" | "muted";
  helper: string;
  icon: "users" | "active" | "due" | "overdue" | "none";
}

function StatIcon({ icon }: { icon: StatCardProps["icon"] }) {
  if (icon === "users") return <UsersIcon />;
  if (icon === "active") return <CheckIcon />;
  if (icon === "due") return <ClockIcon />;
  if (icon === "overdue") return <CalendarIcon />;
  return <SearchIcon />;
}

export function StatsGrid({
  stats,
  locale,
  dict,
}: {
  stats: Record<string, number>;
  locale: Locale;
  dict: Dictionary;
}) {
  const s = dict.dashboard.stats;
  const cards: StatCardProps[] = [
    { label: s.total, value: stats.total ?? 0, filter: "ALL", tone: "neutral", helper: s.totalBody, icon: "users" },
    { label: s.active, value: stats.active ?? 0, filter: "ACTIVE", tone: "active", helper: s.activeBody, icon: "active" },
    { label: s.dueSoon, value: stats.dueSoon ?? 0, filter: "DUE_SOON", tone: "warning", helper: s.dueSoonBody, icon: "due" },
    { label: s.overdue, value: stats.overdue ?? 0, filter: "OVERDUE", tone: "danger", helper: s.overdueBody, icon: "overdue" },
    { label: s.noRecord, value: stats.neverRecorded ?? 0, filter: "NEVER_RECORDED", tone: "muted", helper: s.noRecordBody, icon: "none" },
  ];

  return (
    <div className="stats-grid" aria-label={s.label}>
      {cards.map((card) => (
        <Link
          key={card.filter}
          className={`stat-card stat-card--${card.tone}`}
          href={`/?filter=${card.filter}#members`}
        >
          <div className="stat-card__top">
            <span className="stat-card__icon">
              <StatIcon icon={card.icon} />
            </span>
            <span className="stat-card__label">{card.label}</span>
          </div>
          <strong className="stat-card__value">{formatNumber(card.value, locale)}</strong>
          <span className="stat-card__helper">{card.helper}</span>
        </Link>
      ))}
    </div>
  );
}
