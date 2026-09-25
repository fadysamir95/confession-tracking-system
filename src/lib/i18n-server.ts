import { cookies, headers } from "next/headers";
import type { Dictionary } from "@/lib/dictionaries/en";
import {
  DEFAULT_LOCALE,
  getDictionary,
  isLocale,
  resolveLocale,
  type Locale,
} from "@/lib/i18n";

/**
 * Read by the root layout on every request, including the ones that happen
 * before anybody has signed in — which is exactly the set of requests the
 * login, register and password pages are made of. It deliberately carries no
 * session data: it only decides which dictionary to render with.
 */
export const LOCALE_COOKIE = "confession_locale";

export { getDictionary };

export function getDictionaryFor(locale: Locale): Dictionary {
  return getDictionary(locale);
}

/**
 * Next's request-bound APIs (`cookies`, `headers`) throw rather than return
 * anything empty when there is no request in flight.
 *
 * That is the right behaviour for them and wrong for this function, which is
 * also reached from places that have no reader at all: the test suite, the
 * operator scripts, and any future scheduled work. There is no request means
 * there is no reader, which means there is no reader's language — the default
 * is not a fallback here, it is the answer.
 *
 * Only these two calls are wrapped, and neither has a failure mode other than
 * the missing store, so nothing that could indicate a misconfiguration is
 * swallowed along with it.
 */
async function readRequestPreference(): Promise<{ cookie?: string; acceptLanguage: string }> {
  try {
    const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
    return {
      cookie: cookieStore.get(LOCALE_COOKIE)?.value,
      acceptLanguage: headerStore.get("accept-language") ?? "",
    };
  } catch {
    return { acceptLanguage: "" };
  }
}

/**
 * The cookie is the request-time source of truth, and `User.locale` is the
 * durable one. They are kept in step at the two moments where it matters —
 * signing in, and choosing a language — rather than by reconciling them on
 * every request, which would mean a database round trip in the root layout of
 * every page including the public auth pages that have no user yet.
 */
export async function getRequestLocale(): Promise<Locale> {
  const { cookie, acceptLanguage } = await readRequestPreference();
  if (isLocale(cookie)) return cookie;

  // First visit. Honour the browser rather than guessing, so a priest who has
  // never seen the site before gets it in the language their OS is set to.
  for (const part of acceptLanguage.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase();
    if (tag && (tag === "ar" || tag.startsWith("ar-"))) return "ar";
    if (tag && (tag === "en" || tag.startsWith("en-"))) return "en";
  }

  return DEFAULT_LOCALE;
}

export async function getRequestDictionary(): Promise<Dictionary> {
  return getDictionaryFor(await getRequestLocale());
}

export function localeCookieOptions() {
  return {
    httpOnly: false,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  };
}

export { resolveLocale };
