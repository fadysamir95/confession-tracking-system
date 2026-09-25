"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

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

      if (event.key === "/") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>("[data-member-search]")?.focus();
      } else if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        router.push("/members/new");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  return null;
}
