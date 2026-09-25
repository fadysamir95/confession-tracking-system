import "server-only";
import { AUDIT_ACTIONS } from "@/lib/constants";
import type { TenantDb } from "@/server/db";

/**
 * Appends one entry to the tenant's audit trail.
 *
 * The tenant id is always supplied explicitly rather than inferred, so a row
 * can never be filed against the wrong tenant. RLS would reject a mismatch
 * anyway, which is the backstop that lets this be trusted.
 *
 * The audit log records who did what and when. It deliberately never records
 * member names, phone numbers, attendance dates or any administrative note
 * text: the trail needs to answer "did this happen", not reproduce the personal
 * data behind it. That keeps the log safe to retain, export to backups, or read
 * during an incident without becoming a second copy of the sensitive data.
 */
export async function recordAudit(
  db: TenantDb,
  input: {
    tenantId: string;
    action: (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
    userId: string | null;
    memberId?: string | null;
  },
): Promise<void> {
  await db.auditLog.create({
    data: {
      tenantId: input.tenantId,
      action: input.action,
      userId: input.userId,
      memberId: input.memberId ?? null,
    },
  });
}
