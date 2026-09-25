import { PageHeader } from "@/components/ui/page-header";
import { MemberForm } from "@/components/members/member-form";
import { createMemberAction } from "@/app/actions/member-actions";
import { CAPABILITIES } from "@/lib/constants";
import { getTodayInTimeZone } from "@/lib/dates";
import { getRequestDictionary, getRequestLocale } from "@/lib/i18n-server";
import { requireCapability } from "@/server/auth";
import { getSettings } from "@/server/settings";

export async function generateMetadata() {
  const dict = await getRequestDictionary();
  return { title: dict.pages.addMemberTitle };
}

export default async function AddMemberPage() {
  const context = await requireCapability(CAPABILITIES.MANAGE_MEMBERS);
  const [locale, dict] = await Promise.all([getRequestLocale(), getRequestDictionary()]);
  const settings = await getSettings(context.tenant.id, locale);
  const today = getTodayInTimeZone(settings.timezone);

  return (
    <div className="content-container narrow-page">
      <PageHeader
        eyebrow={dict.pages.addMemberEyebrow}
        title={dict.pages.addMemberTitle}
        description={dict.pages.addMemberBody}
      />
      <MemberForm
        mode="create"
        defaultIntervalDays={settings.defaultIntervalDays}
        today={today}
        action={createMemberAction}
        locale={locale}
        dict={dict}
      />
    </div>
  );
}
