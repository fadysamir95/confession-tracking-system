"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarIcon, UsersIcon } from "@/components/ui/icons";
import { SettingsIcon } from "@/components/ui/settings-icons";
import type { Dictionary } from "@/lib/dictionaries/en";
import { scrollIntoView } from "@/lib/scroll";

/**
 * Every entry point is available to any signed-in member. Visibility here is a
 * convenience for the person using the interface and is never a security
 * boundary: every destination performs its own server-side authorization, and
 * hiding a link only saves a user from a page that would have refused them
 * anyway.
 *
 * The hrefs are paths and hashes only, so the link table is language-independent
 * and the labels are looked up from the dictionary at render time.
 *
 * The roster entry is a section of the dashboard rather than a page of its own,
 * which is why it carries an `anchor` and the others do not. That distinction
 * drives two things below: it is never marked current, because highlighting two
 * items of the same page as the one you are on says nothing, and its click is
 * handled rather than followed.
 */
const LINKS = [
  { href: "/", labelKey: "dashboard", Icon: CalendarIcon },
  { href: "/#members", labelKey: "members", Icon: UsersIcon, anchor: "members" },
  { href: "/settings", labelKey: "settings", Icon: SettingsIcon },
] as const;

export function AppNavigation({ dict }: { dict: Dictionary }) {
  const pathname = usePathname();

  /**
   * Take the roster in view, without a page load.
   *
   * The reason this is not just a link is that the link did not work, and it
   * failed in the one way that is hardest to notice: the address bar already
   * said `/#members`, so the router saw a destination identical to the current
   * one and correctly did nothing at all. The reader had scrolled back up to
   * the top of the dashboard, pressed "Members", and the page stayed exactly
   * where it was — with no error, no flicker, and a link that had plainly been
   * pressed. Repeating the press could never help, because the URL was never
   * going to change.
   *
   * The href is kept anyway. It is what a reader without JavaScript gets, what
   * middle-click and "open in new tab" use, and what a copied link resolves to.
   * Only the ordinary left click is taken over.
   */
  function followAnchor(event: React.MouseEvent<HTMLAnchorElement>, anchor: string) {
    // A modified click is the reader asking the browser for a new tab, a new
    // window, or a download. Intercepting that would break the feature rather
    // than fix it.
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.defaultPrevented
    ) {
      return;
    }

    // Only from the dashboard itself. Pressed from `/settings` this has to be a
    // real navigation, or the roster would be scrolled to on a page that does
    // not contain one.
    if (pathname !== "/") return;

    const target = document.getElementById(anchor);
    if (!target) return;

    event.preventDefault();

    // `replaceState`, not `pushState`, for the same reason the roster filter
    // uses it: this is a view of the page you are already on, not somewhere new
    // to have come back to. Two entries in the history stack for one scroll would
    // mean a reader pressing Back expecting to leave the dashboard and instead
    // being returned to the top of it.
    window.history.replaceState(null, "", `${window.location.pathname}#${anchor}`);
    scrollIntoView(target);
  }

  return (
    <nav className="app-nav" aria-label={dict.nav.primary}>
      {LINKS.map((link) => {
        const Icon = link.Icon;
        const label = dict.nav[link.labelKey];
        // An anchor is not a destination of its own, so it is never the current
        // item: highlighting two entries of one page says nothing about where
        // the reader is.
        //
        // The dashboard is matched exactly, because `/` is a prefix of every
        // path and a substring test would light it up on the settings page too.
        // Settings is matched by segment, so that a page below it — the archived
        // list — still shows where the reader is.
        const active =
          "anchor" in link
            ? false
            : link.href === "/"
              ? pathname === "/"
              : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`app-nav__link ${active ? "is-active" : ""}`}
            aria-label={label}
            onClick={
              "anchor" in link
                ? (event) => followAnchor(event, link.anchor)
                : undefined
            }
          >
            <Icon />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
