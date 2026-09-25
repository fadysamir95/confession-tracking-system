import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";
import { getRequestDictionary, getRequestLocale } from "@/lib/i18n-server";
import { getTenantContext } from "@/server/auth";
import { validateInvite } from "@/server/invites";

export async function generateMetadata() {
  const dict = await getRequestDictionary();
  return { title: dict.auth.register.title };
}

/**
 * Invitation-only registration.
 *
 * A code may be supplied in the query string so an administrator can send a
 * single link that lands directly on the form with it filled in. The code is
 * validated purely to decide which fields to show; it is consumed only by the
 * server action, under a row lock, when the account is actually created.
 */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  if (await getTenantContext()) redirect("/");

  const [{ code }, locale, dict] = await Promise.all([
    searchParams,
    getRequestLocale(),
    getRequestDictionary(),
  ]);
  const invite = code ? await validateInvite(code) : null;
  const t = dict.auth.register;

  return (
    <AuthShell
      titleId="register-title"
      eyebrow={t.eyebrow}
      heading={t.heading}
      // Which paragraph appears depends on what the invitation provisions, and
      // saying so before the form is filled in is the whole point of validating
      // the code here rather than only on submit.
      intro={
        invite
          ? invite.tenantId
            ? t.introExisting
            : t.introNew
          : t.introNone
      }
      privacy={dict.auth.privacyNotice}
      locale={locale}
      dict={dict}
      switcher={
        <>
          {t.haveAccount} <Link href="/login">{t.signIn}</Link>
        </>
      }
    >
      <RegisterForm showTenantName={!invite?.tenantId} dict={dict} />
    </AuthShell>
  );
}
