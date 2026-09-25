import Link from "next/link";
import { AuditLog } from "@/components/settings/audit-log";
import { SecuritySettings, type SessionView } from "@/components/settings/security-settings";
import { SettingsForm } from "@/components/settings/settings-form";
import { PageHeader } from "@/components/ui/page-header";
import { CAPABILITIES } from "@/lib/constants";
import { getSupportedTimeZones } from "@/lib/dates";
import { getRequestDictionary, getRequestLocale } from "@/lib/i18n-server";
import {
  canAccess,
  getCurrentSessionId,
  listUserSessions,
  requireCapability,
} from "@/server/auth";
import { getRecentAuditLogs } from "@/server/queries";
import { getSettings } from "@/server/settings";

/**
 * The title is built from the request dictionary rather than exported as static
 * `metadata`, because a static export cannot await a locale and a page that
 * always says "Settings" in English tells an Arabic-reading priest that the
 * translation is incomplete before they have read a single word of it.
 */
export async function generateMetadata() {
  const dict = await getRequestDictionary();
  return { title: dict.pages.settingsTitle };
}

export default async function SettingsPage() {
  const context = await requireCapability(CAPABILITIES.MANAGE_SETTINGS);
  const tenantId = context.tenant.id;

  const [locale, dict, currentSessionId, rawSessions, auditEntries] = await Promise.all([
    getRequestLocale(),
    getRequestDictionary(),
    getCurrentSessionId(),
    listUserSessions(context.user.id),
    // Read the audit trail only when this membership is entitled to it. A priest
    // who manages their own settings still does not see the administrative log.
    canAccess(context, CAPABILITIES.VIEW_AUDIT) ? getRecentAuditLogs() : Promise.resolve([]),
  ]);

  const settings = await getSettings(tenantId, locale);

  const now = new Date();
  const sessions: SessionView[] = rawSessions
    .filter((session) => session.expiresAt > now)
    .map((session) => ({
      id: session.id,
      createdAt: session.createdAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
    }));

  return (
    <div className="content-container settings-page">
      <PageHeader
        eyebrow={dict.pages.settingsEyebrow}
        title={dict.pages.settingsTitle}
        description={dict.pages.settingsBody}
        actions={
          <Link className="button button--secondary" href="/settings/archived">
            {dict.pages.viewArchived}
          </Link>
        }
      />

      <SettingsForm
        locale={locale}
        dict={dict}
        settings={{
          defaultIntervalDays: settings.defaultIntervalDays,
          dueSoonThresholdDays: settings.dueSoonThresholdDays,
          timezone: settings.timezone,
          dateFormat: settings.dateFormat,
          whatsappCountryCode: settings.whatsappCountryCode,
          whatsappTemplate: settings.whatsappTemplate,
        }}
        timezones={getSupportedTimeZones()}
      />

      <SecuritySettings
        sessions={sessions}
        currentSessionId={currentSessionId}
        timezone={settings.timezone}
        locale={locale}
        dict={dict}
      />

      {auditEntries.length > 0 ? (
        <AuditLog
          timezone={settings.timezone}
          locale={locale}
          dict={dict}
          entries={auditEntries.map((entry) => ({
            id: entry.id,
            action: entry.action,
            memberId: entry.memberId,
            createdAt: entry.createdAt.toISOString(),
            user: entry.user,
          }))}
        />
      ) : null}
    </div>
  );
}
