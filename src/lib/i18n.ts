/**
 * Locale plumbing, kept free of server-only imports so client components can
 * format dates and counts with the same helpers the server uses.
 *
 * The locale is deliberately *not* part of the URL. It is a property of the
 * person, stored on their `User` row, and every priest in the world may prefer a
 * different one. Putting it in the path would make the address bar, the
 * bookmarks and the signed links all disagree with each other the moment
 * somebody changed their mind. Instead the choice lives in a cookie for the
 * request path and on the user row for the durable preference.
 */

import en, { type Dictionary } from "@/lib/dictionaries/en";
import ar from "@/lib/dictionaries/ar";
import type { PluralForms } from "@/lib/plural-forms";

export const LOCALES = ["en", "ar"] as const;

export type Locale = (typeof LOCALES)[number];

/**
 * Arabic is the default. The product is built for Coptic Orthodox parishes,
 * and an English-only default would mean every new account starts in the wrong
 * language with a preference buried in settings.
 */
export const DEFAULT_LOCALE: Locale = "ar";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Normalises anything a cookie or database might hold into a supported locale. */
export function resolveLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function dirFor(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

const dictionaryCache = new Map<Locale, Dictionary>();

/**
 * The message catalog for a locale, memoised.
 *
 * Dictionaries are plain objects held in the module graph, so this is a lookup
 * rather than a network call — but a page that formats two hundred rows would
 * otherwise re-enter the same branch two hundred times, and a `Map` is cheaper
 * than any framework-level caching we would otherwise reach for.
 */
export function getDictionary(locale: Locale): Dictionary {
  const cached = dictionaryCache.get(locale);
  if (cached) return cached;
  const loaded = locale === "ar" ? ar : en;
  dictionaryCache.set(locale, loaded);
  return loaded;
}

/**
 * BCP-47 tags for the Intl APIs.
 *
 * `-u-nu-latn` forces Latin digits under Arabic. Egyptian clergy overwhelmingly
 * read and write dates and phone numbers in Latin digits, and a roster full of
 * Eastern Arabic numerals mixed with Latin phone numbers is harder to scan, not
 * easier. This keeps 2026 and 0123 looking the same.
 */
export function intlLocale(locale: Locale): string {
  return locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB";
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}

export type PluralCategory = Intl.LDMLPluralRule;

export type { PluralForms };

const pluralRules = new Map<Locale, Intl.PluralRules>();

function rulesFor(locale: Locale): Intl.PluralRules {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(intlLocale(locale));
    pluralRules.set(locale, rules);
  }
  return rules;
}

/**
 * Picks the right grammatical form for `count` and substitutes `{count}`.
 * Hand-written `count === 1 ? "day" : "days"` checks are wrong in Arabic, where
 * 2, 3-10 and 11+ all take different forms, and in English only because English
 * happens to collapse its other categories into one.
 */
export function formatPlural(
  count: number,
  locale: Locale,
  forms: PluralForms,
): string {
  const category = rulesFor(locale).select(count);
  const template = forms[category] ?? forms.other;
  // A locale that supplied neither is a dictionary bug, and rendering the raw
  // category name makes it visible immediately instead of printing "undefined"
  // into a message a priest is about to read.
  if (template === undefined) {
    return String(count);
  }
  return template.replace("{count}", formatNumber(count, locale));
}

/**
 * Substitutes `{name}`-style holes in a dictionary entry.
 *
 * Every phrase in the dictionaries goes through this rather than template
 * literals so that Arabic is free to move a placeholder to a different position
 * — "عرض {name}" and not "{name} عرض" — without any call site having to know
 * which language it is in. A hole with no matching value is left untouched
 * rather than blanked, so a missing argument is visible during development
 * instead of silently deleting part of a sentence.
 */
export function fill(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
