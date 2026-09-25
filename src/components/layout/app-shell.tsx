import type { ReactNode } from "react";
import Link from "next/link";
import { logoutAction } from "@/app/actions/auth-actions";
import { AppNavigation } from "@/components/layout/app-navigation";
import { LogoutIcon, ShieldIcon } from "@/components/ui/icons";
import { BrandMark } from "@/components/ui/brand-mark";
import type { TenantContext } from "@/server/auth";
import { roleLabel } from "@/lib/labels";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/lib/dictionaries/en";
import { LanguageSwitcher } from "@/components/settings/language-switcher";

export function AppShell({
  context,
  locale,
  dict,
  children,
}: {
  context: TenantContext;
  locale: Locale;
  dict: Dictionary;
  children: ReactNode;
}) {
  const { user, tenant, membership } = context;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label={dict.nav.home}>
          <span className="brand__mark" aria-hidden="true">
            <BrandMark />
          </span>
          <span>
            <strong>{dict.shell.brandLineOne}</strong>
            <small>{dict.shell.brandLineTwo}</small>
          </span>
        </Link>

        <AppNavigation dict={dict} />

        <div className="sidebar__footer">
          {/* The language control lives in the shell rather than only on the
              settings page. Settings is one of several places a priest might
              never visit, and a language they cannot change from the screen in
              front of them is a language they are stuck reading. */}
          <LanguageSwitcher
            locale={locale}
            dict={dict}
            note={dict.settings.language.note}
          />
          <div className="privacy-note">
            <ShieldIcon />
            <div>
              <strong>{dict.shell.privacyTitle}</strong>
              <span>{dict.shell.privacyBody}</span>
            </div>
          </div>
          <div className="sidebar__user">
            <span className="avatar" aria-hidden="true">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="sidebar__user-copy">
              {/* The tenant name is shown so a priest working across more than
                  one parish can tell at a glance which one is open. In V1 a
                  user holds a single membership, so this is confirmation
                  rather than navigation. */}
              <strong>{tenant.name}</strong>
              <span>{roleLabel(membership.role, dict)}</span>
            </div>
            <form action={logoutAction}>
              <button
                className="icon-button"
                type="submit"
                aria-label={dict.nav.signOut}
                title={dict.nav.signOut}
              >
                <LogoutIcon />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="app-shell__mobile-header">
        <Link className="brand brand--compact" href="/" aria-label={dict.nav.home}>
          <span className="brand__mark" aria-hidden="true">
            <BrandMark />
          </span>
          <strong>{dict.app.name}</strong>
        </Link>
        <AppNavigation dict={dict} />
      </div>

      <main className="main-content">{children}</main>
    </div>
  );
}
