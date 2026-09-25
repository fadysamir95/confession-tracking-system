import Link from "next/link";
import { ArchivedMemberList } from "@/components/members/archived-member-list";
import { PageHeader } from "@/components/ui/page-header";
import { ShieldIcon } from "@/components/ui/icons";
import { CAPABILITIES } from "@/lib/constants";
import { getRequestDictionary, getRequestLocale } from "@/lib/i18n-server";
import { getTenantContext, requireCapability } from "@/server/auth";
import { getArchivedMembers } from "@/server/queries";
import { getSettings } from "@/server/settings";

export async function generateMetadata() {
  const dict = await getRequestDictionary();
  return { title: dict.pages.archivedTitle };
}

export default async function ArchivedMembersPage() {
  // The capability check runs first so the settings lookup is never reached by
  // a member who is not entitled to see this page at all.
  await requireCapability(CAPABILITIES.MANAGE_MEMBERS);
  const context = await getTenantContext();
  if (!context) return null;

  const locale = await getRequestLocale();
  const dict = await getRequestDictionary();
  const [members, settings] = await Promise.all([
    getArchivedMembers(),
    getSettings(context.tenant.id, locale),
  ]);

  return (
    <div className="content-container archived-page">
      <PageHeader
        eyebrow={dict.pages.archivedEyebrow}
        title={dict.pages.archivedTitle}
        description={dict.pages.archivedBody}
        actions={
          <Link className="button button--secondary" href="/settings">
            {dict.pages.backToSettings}
          </Link>
        }
      />

      <div className="archived-guidance">
        <ShieldIcon />
        <div>
          <strong>{dict.pages.archiveHeading}</strong>
          <p>{dict.pages.archiveBody}</p>
        </div>
      </div>

      <ArchivedMemberList
        members={members}
        dateFormat={settings.dateFormat}
        timezone={settings.timezone}
        locale={locale}
        dict={dict}
      />
    </div>
  );
}
