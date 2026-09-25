import type { ReactNode } from "react";
import { BrandMark } from "@/components/ui/brand-mark";
import { ShieldIcon } from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/settings/language-switcher";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/lib/dictionaries/en";

/**
 * The frame every public screen sits in.
 *
 * The panel is a single column and is centred on its own. It used to be a
 * two-column layout whose second column held three numbered privacy principles,
 * which is the block that was removed; the grid went with it rather than being
 * left behind to hold one panel, so this is now one centred column rather than
 * a half-width one.
 *
 * `privacy` is a single line under the form, not a panel. It says what the
 * system does not collect, which is worth stating once where someone is about to
 * type, and is not worth three times on a screen the reader came to use.
 */
export function AuthShell({
  titleId,
  eyebrow,
  heading,
  intro,
  privacy,
  switcher,
  children,
  locale,
  dict,
}: {
  titleId: string;
  eyebrow: string;
  heading: string;
  intro: string;
  privacy?: string;
  switcher?: ReactNode;
  children: ReactNode;
  locale: Locale;
  dict: Dictionary;
}) {
  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby={titleId}>
        <div className="auth-brand">
          <span className="brand__mark brand__mark--large" aria-hidden="true">
            <BrandMark />
          </span>
          <div>
            <strong>{dict.app.name}</strong>
            <span>{dict.app.tagline}</span>
          </div>
        </div>

        <div className="auth-panel__copy">
          <p className="eyebrow">{eyebrow}</p>
          <h1 id={titleId}>{heading}</h1>
          <p>{intro}</p>
        </div>

        {children}

        {switcher ? <p className="auth-switch">{switcher}</p> : null}

        {privacy ? (
          <div className="auth-privacy">
            <ShieldIcon />
            <p>{privacy}</p>
          </div>
        ) : null}

        {/* Present on the public pages too. Someone who has never seen the site
            and cannot read its language has no way to sign in to change it, and
            no way to reach the settings page that would let them. */}
        <div className="auth-language">
          <LanguageSwitcher
            locale={locale}
            dict={dict}
            note={dict.settings.language.signedOutNote}
          />
        </div>
      </section>
    </main>
  );
}
