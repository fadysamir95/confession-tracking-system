import type { Dictionary } from "@/lib/dictionaries/en";
import type { MemberStatus } from "@/lib/constants";

/**
 * One resolver per enum-shaped label in the app. Keeping them here means the
 * status badge on a row, the status filter chip and the status column of an
 * exported CSV are all reading the same dictionary entry instead of three
 * separate literals that can drift apart.
 */
export function statusLabel(status: MemberStatus, dict: Dictionary): string {
  return dict.status[status];
}

export function roleLabel(role: string, dict: Dictionary): string {
  return role === "TENANT_ADMIN" ? dict.roles.TENANT_ADMIN : dict.roles.PRIEST;
}
