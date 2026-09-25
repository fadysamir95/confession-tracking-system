import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { MemberForm } from "@/components/members/member-form";
import { updateMemberAction } from "@/app/actions/member-actions";
import { CAPABILITIES } from "@/lib/constants";
import { getRequestDictionary, getRequestLocale } from "@/lib/i18n-server";
import { requireCapability } from "@/server/auth";
import { withTenant } from "@/server/db";
import { getSettings } from "@/server/settings";
import { getTodayInTimeZone } from "@/lib/dates";
import { fill } from "@/lib/i18n";

export async function generateMetadata() {
  const dict = await getRequestDictionary();
  return { title: dict.pages.editMemberTitle };
}

export default async function EditMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireCapability(CAPABILITIES.MANAGE_MEMBERS);
  const tenantId = context.tenant.id;
  const locale = await getRequestLocale();
  const dict = await getRequestDictionary();

  const [member, settings] = await Promise.all([
    // Scoped to the caller's own tenant. An id belonging to another priest
    // matches no row and falls through to notFound(), which is the same
    // response an id that does not exist at all produces, so the page never
    // confirms the existence of somebody else's record.
    withTenant(tenantId, (db) =>
      db.member.findFirst({
        where: { tenantId, id, archivedAt: null },
        select: {
          id: true,
          name: true,
          phone: true,
          confessionIntervalDays: true,
          administrativeNote: true,
        },
      }),
    ),
    getSettings(tenantId, locale),
  ]);

  if (!member) notFound();
  const today = getTodayInTimeZone(settings.timezone);

  return (
    <div className="content-container narrow-page">
      <PageHeader
        eyebrow={dict.pages.editMemberEyebrow}
        title={fill(dict.pages.editMemberTitleWithName, { name: member.name })}
        description={dict.pages.editMemberBody}
      />
      <MemberForm
        mode="edit"
        member={member}
        defaultIntervalDays={settings.defaultIntervalDays}
        today={today}
        action={updateMemberAction}
        locale={locale}
        dict={dict}
      />
    </div>
  );
}
