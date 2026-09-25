"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Dashboard shortcuts, matched on the physical key rather than the character.
 *
 * `KeyboardEvent.key` is whatever the *layout* produced, so on an Arabic
 * keyboard the key an English speaker thinks of as `/` reports `؟`, and the key
 * for `n` reports `ن`. Matching on `key` would mean every shortcut here works
 * for the people least likely to be using them, which is the exact inversion of
 * what a keyboard shortcut is for — this application's readers are Arabic
 * speakers, many of whom type across both layouts.
 *
 * `KeyboardEvent.code` is the key's position on the board, identical in every
 * layout, so pressing the key under the `/` on an Arabic keyboard still focuses
 * search. The character the layout *would* have produced is never typed, because
 * `preventDefault` runs first — which is what stops a stray `؟` from landing in
 * the search box.
 */
export function DashboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if (isTyping || event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.code === "Slash") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>("[data-member-search]")?.focus();
      } else if (event.code === "KeyN") {
        event.preventDefault();
        router.push("/members/new");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  return null;
}
