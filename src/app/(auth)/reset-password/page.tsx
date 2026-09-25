import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getRequestDictionary, getRequestLocale } from "@/lib/i18n-server";
import { getTenantContext } from "@/server/auth";

export async function generateMetadata() {
  const dict = await getRequestDictionary();
  return { title: dict.auth.resetPassword.title };
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  if (await getTenantContext()) redirect("/");

  const [{ token }, locale, dict] = await Promise.all([
    searchParams,
    getRequestLocale(),
    getRequestDictionary(),
  ]);
  const t = dict.auth.resetPassword;

  // A missing or over-long token is rejected here rather than being handed to
  // the form, so the page never appears to be waiting for input that cannot
  // possibly work. The token is still re-validated server-side on submission;
  // this check is presentation, not authorization.
  if (!token || token.length < 10 || token.length > 200) {
    return (
      <AuthShell
        titleId="invalid-title"
        eyebrow={t.invalidEyebrow}
        heading={t.invalidHeading}
        intro={t.invalidBody}
        locale={locale}
        dict={dict}
        switcher={
          <Link href="/forgot-password">{t.requestNew}</Link>
        }
      >
        {/* Nothing to submit: the page is telling the priest their link is
            spent, so rendering an empty form slot would be a lie about what
            this screen does. */}
        <div className="auth-form" />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      titleId="reset-title"
      eyebrow={t.eyebrow}
      heading={t.heading}
      intro={t.intro}
      privacy={t.privacy}
      locale={locale}
      dict={dict}
    >
      <ResetPasswordForm token={token} dict={dict} />
    </AuthShell>
  );
}
