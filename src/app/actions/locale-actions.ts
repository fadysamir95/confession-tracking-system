"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantContext } from "@/server/auth";
import { withoutTenant } from "@/server/db";
import { type Locale } from "@/lib/i18n";
import { LOCALE_COOKIE, localeCookieOptions } from "@/lib/i18n-server";

const schema = z.enum(["en", "ar"]);

/**
 * Persists the language in two places on purpose.
 *
 * The cookie is what the root layout reads, so the change takes effect on the
 * very next render — including on the public auth pages, where there is no
 * signed-in user to consult. `User.locale` is what survives a new device, so
 * signing in on a phone nobody has used before still comes up in the reader's
 * own language.
 *
 * The write is on `User` rather than on the membership deliberately: the
 * language belongs to the person, not to the parish they happen to be serving,
 * and `User` is one of the tables deliberately left outside RLS precisely so
 * that identity-level preferences can be read before a tenant is known.
 */
export async function setLocaleAction(formData: FormData): Promise<void> {
  const parsed = schema.safeParse(formData.get("locale"));
  if (!parsed.success) return;

  const locale: Locale = parsed.data;
  (await cookies()).set(LOCALE_COOKIE, locale, localeCookieOptions());

  // Only persist the durable preference if somebody is actually signed in. The
  // switcher is also rendered on the sign-in page, where there is no user row
  // to update and the cookie alone is the right amount of state.
  const context = await getTenantContext();
  if (context) {
    await withoutTenant((db) =>
      db.user.update({
        where: { id: context.user.id },
        data: { locale },
      }),
    );
  }

  revalidatePath("/", "layout");
}
