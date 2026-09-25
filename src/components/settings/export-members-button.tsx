"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DownloadIcon } from "@/components/ui/icons";
import type { Dictionary } from "@/lib/dictionaries/en";

export function ExportMembersButton({ dict }: { dict: Dictionary }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function exportMembers() {
    if (pending) return;
    if (!window.confirm(dict.settings.export.confirm)) {
      return;
    }

    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/export/members", {
        method: "POST",
        headers: { Accept: "text/csv" },
        credentials: "same-origin",
      });
      if (!response.ok) {
        // The route refuses in the reader's own language, so its body is a
        // usable message rather than something to be replaced with a generic
        // one that throws away the reason.
        throw new Error((await response.text()) || dict.settings.export.error);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "confession-attendance-members.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setMessage(dict.settings.export.success);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : dict.settings.export.error);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="export-action">
      <button className="button button--secondary" type="button" onClick={exportMembers} disabled={pending}>
        <DownloadIcon /> {pending ? dict.settings.export.pending : dict.settings.export.submit}
      </button>
      {message ? <small role="status">{message}</small> : null}
    </div>
  );
}
