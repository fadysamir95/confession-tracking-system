"use client";

import { useEffect, useState } from "react";
import { BrandMark } from "@/components/ui/brand-mark";
import { PRELOADER_STORAGE_KEY } from "@/lib/preloader";

/** Long enough to register as intentional, short enough not to be in the way. */
const HOLD_MS = 520;
const FADE_MS = 380;

/**
 * First-paint splash. It is always present in the server-rendered HTML, and the
 * guard script in the document head hides it via CSS when this tab has already
 * seen it — so this component never has to decide *whether* to render, only
 * when to dismiss what is already on screen.
 */
export function AppPreloader({ label }: { label: string }) {
  const [leaving, setLeaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(PRELOADER_STORAGE_KEY, "1");
    } catch {
      // Some private-browsing modes refuse sessionStorage writes. The splash
      // then replays on each navigation, which is cosmetic, so it is not worth
      // failing a render over.
    }

    const hold = window.setTimeout(() => setLeaving(true), HOLD_MS);
    const drop = window.setTimeout(() => setDismissed(true), HOLD_MS + FADE_MS);

    return () => {
      window.clearTimeout(hold);
      window.clearTimeout(drop);
    };
  }, []);

  if (dismissed) return null;

  return (
    <div
      className={`preloader${leaving ? " preloader--leaving" : ""}`}
      role="status"
      aria-label={label}
    >
      <span className="preloader__mark" aria-hidden="true">
        <BrandMark />
      </span>
      <span className="preloader__bar" aria-hidden="true">
        <span />
      </span>
    </div>
  );
}
