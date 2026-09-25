import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { getRequestDictionary, getRequestLocale } from "@/lib/i18n-server";
import { getTenantContext } from "@/server/auth";

export async function generateMetadata() {
  const dict = await getRequestDictionary();
  return { title: dict.auth.signIn.title };
}

export default async function LoginPage() {
  if (await getTenantContext()) redirect("/");

  const [locale, dict] = await Promise.all([getRequestLocale(), getRequestDictionary()]);
  const t = dict.auth.signIn;

  return (
    <AuthShell
      titleId="login-title"
      eyebrow={t.eyebrow}
      heading={t.heading}
      intro={t.intro}
      privacy={dict.auth.privacyNotice}
      locale={locale}
      dict={dict}
      switcher={
        <>
          <Link href="/forgot-password">{t.forgot}</Link>
          <span aria-hidden="true"> · </span>
          <Link href="/register">{t.invite}</Link>
        </>
      }
    >
      <LoginForm dict={dict} />
    </AuthShell>
  );
}
