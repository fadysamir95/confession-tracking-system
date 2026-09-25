import { AppShell } from "@/components/layout/app-shell";
import { requireTenantContext } from "@/server/auth";
import { getRequestDictionary, getRequestLocale } from "@/lib/i18n-server";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // The whole dashboard is gated on a resolved tenant, not merely on being
  // signed in. A valid session belonging to somebody with no membership is
  // treated as no session at all.
  const context = await requireTenantContext();
  const [locale, dict] = await Promise.all([getRequestLocale(), getRequestDictionary()]);
  return (
    <AppShell context={context} locale={locale} dict={dict}>
      {children}
    </AppShell>
  );
}
