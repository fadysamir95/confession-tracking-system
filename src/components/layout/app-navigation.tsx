"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarIcon, UsersIcon } from "@/components/ui/icons";
import { SettingsIcon } from "@/components/ui/settings-icons";
import type { Dictionary } from "@/lib/dictionaries/en";

/**
 * Every entry point is available to any signed-in member. Visibility here is a
 * convenience for the person using the interface and is never a security
 * boundary: every destination performs its own server-side authorization, and
 * hiding a link only saves a user from a page that would have refused them
 * anyway.
 *
 * The hrefs are icons and hashes only, so the link table is language-independent
 * and the labels are looked up from the dictionary at render time.
 */
const LINKS = [
  { href: "/", labelKey: "dashboard", Icon: CalendarIcon },
  { href: "/#members", labelKey: "members", Icon: UsersIcon },
  { href: "/settings", labelKey: "settings", Icon: SettingsIcon },
] as const;

export function AppNavigation({ dict }: { dict: Dictionary }) {
  const pathname = usePathname();

  return (
    <nav className="app-nav" aria-label={dict.nav.primary}>
      {LINKS.map((link) => {
        const Icon = link.Icon;
        const label = dict.nav[link.labelKey];
        const active =
          link.href === "/"
            ? pathname === "/"
            : link.href.startsWith(pathname) && pathname !== "/";
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`app-nav__link ${active ? "is-active" : ""}`}
            aria-label={label}
          >
            <Icon />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
