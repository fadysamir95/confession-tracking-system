import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { getRequestDictionary, getRequestLocale } from "@/lib/i18n-server";
import { getTenantContext } from "@/server/auth";

export async function generateMetadata() {
  const dict = await getRequestDictionary();
  return { title: dict.auth.forgotPassword.title };
}

export default async function ForgotPasswordPage() {
  if (await getTenantContext()) redirect("/");

  const [locale, dict] = await Promise.all([getRequestLocale(), getRequestDictionary()]);
  const t = dict.auth.forgotPassword;

  return (
    <AuthShell
      titleId="forgot-title"
      eyebrow={t.eyebrow}
      heading={t.heading}
      intro={t.intro}
      privacy={t.privacy}
      principles={["noDisclosure", "storedHashed", "fullSignOut"]}
      locale={locale}
      dict={dict}
      switcher={<Link href="/login">{t.back}</Link>}
    >
      <ForgotPasswordForm dict={dict} />
    </AuthShell>
  );
}
