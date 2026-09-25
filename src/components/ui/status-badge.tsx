import type { MemberStatus } from "@/lib/constants";
import { statusLabel } from "@/lib/labels";
import type { Dictionary } from "@/lib/dictionaries/en";

export function StatusBadge({
  status,
  dict,
}: {
  status: MemberStatus;
  dict: Dictionary;
}) {
  return (
    <span className={`status-badge status-badge--${status.toLowerCase()}`}>
      <span className="status-badge__dot" aria-hidden="true" />
      {statusLabel(status, dict)}
    </span>
  );
}
