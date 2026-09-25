import Link from "next/link";
import { ImportForm } from "@/components/members/import-form";
import { PageHeader } from "@/components/ui/page-header";
import { CAPABILITIES } from "@/lib/constants";
import { getRequestDictionary, getRequestLocale } from "@/lib/i18n-server";
import { requireCapability } from "@/server/auth";

export async function generateMetadata() {
  const dict = await getRequestDictionary();
  return { title: dict.import.pageTitle };
}

export default async function ImportMembersPage() {
  await requireCapability(CAPABILITIES.MANAGE_MEMBERS);
  const [locale, dict] = await Promise.all([getRequestLocale(), getRequestDictionary()]);

  return (
    <div className="content-container narrow-page">
      <PageHeader
        eyebrow={dict.import.pageEyebrow}
        title={dict.import.pageTitle}
        description={dict.import.pageBody}
        actions={
          <Link className="button button--secondary" href="/members">
            {dict.import.goToMembers}
          </Link>
        }
      />
      <ImportForm locale={locale} dict={dict} />
    </div>
  );
}
