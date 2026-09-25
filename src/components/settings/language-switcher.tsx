import { setLocaleAction } from "@/app/actions/locale-actions";
import { LOCALES, type Locale } from "@/lib/i18n";
import type { Dictionary } from "@/lib/dictionaries/en";

/**
 * A server-rendered form rather than a client-side toggle, so switching the
 * language is a plain navigation: the new dictionary is rendered on the first
 * paint with no client bundle, no hydration and no flash of the wrong language.
 *
 * `dict` is the dictionary of the language currently on screen, which is why
 * each button can be labelled in the language it switches *to* rather than in
 * the one it is leaving.
 */
export function LanguageSwitcher({
  locale,
  dict,
  note,
}: {
  locale: Locale;
  dict: Dictionary;
  /**
   * Passed in rather than looked up, because what the choice does depends on
   * whether anybody is signed in: inside the app it is stored on the account,
   * on the auth pages it is only a cookie. Deriving that from a prop at the call
   * site keeps the switcher from having to read the session, which it has no
   * reason to.
   */
  note: string;
}) {
  const labels: Record<Locale, string> = {
    en: dict.settings.language.en,
    ar: dict.settings.language.ar,
  };

  return (
    <form action={setLocaleAction} className="language-switcher">
      <span className="language-switcher__label" id="language-switcher-label">
        {dict.settings.language.label}
      </span>
      <div
        className="language-switcher__options"
        role="group"
        aria-labelledby="language-switcher-label"
      >
        {LOCALES.map((option) => (
          <button
            key={option}
            type="submit"
            name="locale"
            value={option}
            className={`language-switcher__option${
              option === locale ? " is-active" : ""
            }`}
            aria-pressed={option === locale}
          >
            {labels[option]}
          </button>
        ))}
      </div>
      <p className="language-switcher__note">{note}</p>
    </form>
  );
}
