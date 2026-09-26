import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { headers } from "next/headers";
import { AppPreloader } from "@/components/ui/app-preloader";
import { PRELOADER_GUARD_SCRIPT } from "@/lib/preloader";
import { RECENT_CARD_GUARD_SCRIPT } from "@/lib/recent-card";
import { dirFor } from "@/lib/i18n";
import { getRequestDictionary, getRequestLocale } from "@/lib/i18n-server";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#123f3a",
};

/**
 * Titles are generated per request rather than exported statically, because the
 * product name itself is translated. A static `metadata` export cannot await the
 * locale and would put an English product name on every Arabic page.
 */
export async function generateMetadata(): Promise<Metadata> {
  const dict = await getRequestDictionary();
  return {
    title: {
      default: dict.app.name,
      template: dict.app.titleTemplate,
    },
    description: dict.app.description,
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The request-scoped CSP nonce requires dynamic rendering on every page.
  await connection();
  // Injected by src/proxy.ts. Next.js applies the nonce to its own scripts from
  // the request CSP header, but the preloader guard is ours and has to carry it
  // explicitly or `script-src 'strict-dynamic'` will refuse to run it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const locale = await getRequestLocale();
  const dict = await getRequestDictionary();

  return (
    // The guard script sets a data attribute on <html> before hydration, which
    // React would otherwise report as a mismatch.
    <html lang={locale} dir={dirFor(locale)} suppressHydrationWarning>
      <body>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: PRELOADER_GUARD_SCRIPT }} />
        {/* The same arrangement for the recently-recorded card: read the key and
            set an attribute before the card is parsed, so a dismissal is in force
            on the first paint rather than after a frame of it. It is not next to
            the preloader guard for any reason other than both being the earliest
            synchronous script in the document; neither depends on the other. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: RECENT_CARD_GUARD_SCRIPT }} />
        <AppPreloader label={dict.common.loading} />
        {children}
      </body>
    </html>
  );
}
