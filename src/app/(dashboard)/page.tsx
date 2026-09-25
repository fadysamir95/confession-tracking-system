import { CheckIcon, PlusIcon, ShieldIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { AttentionSection } from "@/components/dashboard/attention-section";
import { DashboardFeedback } from "@/components/dashboard/dashboard-feedback";
import { DashboardShortcuts } from "@/components/dashboard/dashboard-shortcuts";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { MemberExplorer } from "@/components/members/member-explorer";
import { formatDate } from "@/lib/dates";
import { fill, formatNumber } from "@/lib/i18n";
import { getRequestDictionary, getRequestLocale } from "@/lib/i18n-server";
import { getDashboardData } from "@/server/queries";

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata() {
  const dict = await getRequestDictionary();
  return { title: dict.dashboard.title };
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const [data, params, locale, dict] = await Promise.all([
    getDashboardData(),
    searchParams,
    getRequestLocale(),
    getRequestDictionary(),
  ]);
  const initialFilter = typeof params.filter === "string" ? params.filter : undefined;
  const autoFocus = params.focus === "1";

  return (
    <div className="content-container dashboard-page">
      <DashboardShortcuts />

      <PageHeader
        eyebrow={dict.dashboard.eyebrow}
        title={dict.dashboard.title}
        description={fill(dict.dashboard.description, {
          date: formatDate(data.today, data.settings.dateFormat, locale, dict.dates.noRecord),
          timezone: data.settings.timezone,
        })}
        actions={
          <a className="button button--primary" href="/members/new">
            <PlusIcon /> {dict.dashboard.addMember}
          </a>
        }
      />

      {params.created === "1" || params.updated === "1" ? (
        <div className="form-alert form-alert--success dashboard-success" role="status">
          <CheckIcon />{" "}
          {params.created === "1" ? dict.dashboard.saved : dict.dashboard.updated}
        </div>
      ) : null}

      <StatsGrid stats={data.stats} locale={locale} dict={dict} />

      <DashboardFeedback>
        <QuickActions
          members={data.members}
          today={data.today}
          dateFormat={data.settings.dateFormat}
          overdueCount={data.stats.overdue}
          dueSoonCount={data.stats.dueSoon}
          locale={locale}
          dict={dict}
        />

        <section className="activity-summary" aria-label={dict.dashboard.activityLabel}>
          <div>
            <span>{dict.dashboard.thisWeek}</span>
            <strong>{formatNumber(data.stats.confessionsThisWeek, locale)}</strong>
            <small>{dict.dashboard.confessionsRecorded}</small>
          </div>
          <div>
            <span>{dict.dashboard.thisMonth}</span>
            <strong>{formatNumber(data.stats.confessionsThisMonth, locale)}</strong>
            <small>{dict.dashboard.confessionsRecorded}</small>
          </div>
          <p>
            <ShieldIcon />
            {dict.dashboard.activityNote}
          </p>
        </section>

        <section className="attention-section" aria-labelledby="attention-heading">
          <div className="section-heading">
            <div>
              <h2 id="attention-heading">{dict.dashboard.needsAttention}</h2>
              <p>{dict.dashboard.needsAttentionBody}</p>
            </div>
          </div>
          <div className="attention-grid">
            <AttentionSection
              title={dict.status.OVERDUE}
              description={dict.dashboard.overdueBody}
              status="OVERDUE"
              members={data.attention.overdue}
              dateFormat={data.settings.dateFormat}
              today={data.today}
              allHref="/?filter=OVERDUE#members"
              locale={locale}
              dict={dict}
            />
            <AttentionSection
              title={dict.status.DUE_SOON}
              description={fill(dict.dashboard.dueSoonBody, {
                count: formatNumber(data.settings.dueSoonThresholdDays, locale),
              })}
              status="DUE_SOON"
              members={data.attention.dueSoon}
              dateFormat={data.settings.dateFormat}
              today={data.today}
              allHref="/?filter=DUE_SOON#members"
              locale={locale}
              dict={dict}
            />
            <AttentionSection
              title={dict.dashboard.neverRecorded}
              description={dict.dashboard.neverRecordedBody}
              status="NEVER_RECORDED"
              members={data.attention.neverRecorded}
              dateFormat={data.settings.dateFormat}
              today={data.today}
              allHref="/?filter=NEVER_RECORDED#members"
              locale={locale}
              dict={dict}
            />
          </div>
        </section>
      </DashboardFeedback>

      <div className="dashboard-lower-grid">
        <RecentActivity
          records={data.recent}
          dateFormat={data.settings.dateFormat}
          locale={locale}
          dict={dict}
        />
        <section className="surface-card privacy-card">
          <span className="privacy-card__icon">
            <ShieldIcon />
          </span>
          <div>
            <h2>{dict.dashboard.privacyHeading}</h2>
            <p>{dict.dashboard.privacyBody}</p>
          </div>
        </section>
      </div>

      <MemberExplorer
        members={data.members}
        today={data.today}
        canManageLifecycle={data.canManageLifecycle}
        dateFormat={data.settings.dateFormat}
        initialFilter={initialFilter}
        autoFocus={autoFocus}
        locale={locale}
        dict={dict}
      />
    </div>
  );
}
