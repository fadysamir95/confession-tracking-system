import type { ReactNode } from "react";
import { BrandMark } from "@/components/ui/brand-mark";
import { ShieldIcon } from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/settings/language-switcher";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/lib/dictionaries/en";

/**
 * A key into the flat catalogue of privacy principles.
 *
 * The catalogue itself is one block of copy, and each screen chooses which
 * three of it to show. Selecting by key rather than by writing a new triple per
 * screen means a principle is phrased once in every language, and a screen that
 * wants a different set of three costs three short identifiers instead of six
 * new strings that would need translating again.
 */
export type PrincipleKey = keyof Dictionary["auth"]["principlesContent"];

export function AuthShell({
  titleId,
  eyebrow,
  heading,
  intro,
  principles,
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
  principles: [PrincipleKey, PrincipleKey, PrincipleKey];
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

      <aside className="auth-aside" aria-label={dict.auth.principles}>
        {principles.map((key, index) => {
          const principle = dict.auth.principlesContent[key];
          return (
            <div key={key}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h2>{principle.title}</h2>
              <p>{principle.body}</p>
            </div>
          );
        })}
      </aside>
    </main>
  );
}
