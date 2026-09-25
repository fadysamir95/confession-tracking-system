import { revalidatePath } from "next/cache";
import { AUDIT_ACTIONS, CAPABILITIES } from "@/lib/constants";
import { isSameOriginRequest } from "@/lib/csrf";
import { createCsv } from "@/lib/csv";
import { getTodayInTimeZone } from "@/lib/dates";
import { fill, intlLocale } from "@/lib/i18n";
import { getRequestDictionary, getRequestLocale } from "@/lib/i18n-server";
import { statusLabel } from "@/lib/labels";
import { toMemberListItem } from "@/lib/member-domain";
import { canAccess, getTenantContext } from "@/server/auth";
import { recordAudit } from "@/server/audit";
import { withTenant } from "@/server/db";
import { getSettings } from "@/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_EXPORT_ROWS = 10_000;

const memberSelect = {
  id: true,
  name: true,
  phone: true,
  lastConfessionDate: true,
  confessionIntervalDays: true,
} as const;

function errorResponse(
  message: string,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

/**
 * Exports the caller's own active-member roster as CSV.
 *
 * There is no tenant parameter anywhere in this handler, by design. The tenant
 * comes from the session, the queries run inside that tenant's RLS context, and
 * there is no code path that would let a request name a different one. A
 * `?tenantId=` on the URL is therefore not merely ignored, it has nowhere to
 * go.
 */
export async function POST(request: Request): Promise<Response> {
  // The dictionary is read before any gate, because every refusal below is
  // itself a sentence a person has to read, and a refusal phrased in a
  // language the reader did not ask for is its own small failure.
  const dict = await getRequestDictionary();

  if (!isSameOriginRequest(request)) {
    return errorResponse(dict.errors.crossOriginExport, 403);
  }

  const context = await getTenantContext();
  if (!context) return errorResponse(dict.errors.authRequired, 401);
  if (!canAccess(context, CAPABILITIES.EXPORT_DATA)) {
    return errorResponse(dict.errors.exportAccessRequired, 403);
  }

  const tenantId = context.tenant.id;
  const locale = await getRequestLocale();
  const settings = await getSettings(tenantId, locale);
  const today = getTodayInTimeZone(settings.timezone);

  const { members, memberCount } = await withTenant(tenantId, async (db) => {
    const [count, rows] = await Promise.all([
      db.member.count({ where: { tenantId, archivedAt: null } }),
      db.member.findMany({
        where: { tenantId, archivedAt: null },
        select: memberSelect,
        orderBy: { nameNormalized: "asc" },
        // One more than the cap, so a roster that grew past the limit between
        // the count and the read is detected rather than silently truncated.
        take: MAX_EXPORT_ROWS + 1,
      }),
    ]);
    return { members: rows, memberCount: count };
  });

  if (memberCount > MAX_EXPORT_ROWS || members.length > MAX_EXPORT_ROWS) {
    return errorResponse(
      fill(dict.errors.rosterTooLarge, {
        count: new Intl.NumberFormat(intlLocale(locale)).format(MAX_EXPORT_ROWS),
      }),
      413,
    );
  }

  const rows = members.map((member) => {
    const metrics = toMemberListItem(member, settings, today);
    return [
      member.name,
      member.phone,
      member.lastConfessionDate,
      metrics.effectiveIntervalDays,
      metrics.nextDueDate,
      statusLabel(metrics.status, dict),
    ];
  });

  const csv = createCsv(
    [
      dict.settings.export.columns.name,
      dict.settings.export.columns.phone,
      dict.settings.export.columns.lastDate,
      dict.settings.export.columns.interval,
      dict.settings.export.columns.nextDue,
      dict.settings.export.columns.status,
    ],
    rows,
  );

  // The export is itself an audited event, filed in the exporting tenant's
  // trail. If a row count is needed for an incident, it is the response header
  // that carries it; the audit entry deliberately stores no member data.
  await withTenant(tenantId, (db) =>
    recordAudit(db, {
      tenantId,
      action: AUDIT_ACTIONS.DATA_EXPORTED,
      userId: context.user.id,
    }),
  );
  revalidatePath("/settings");

  return new Response(csv, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="confession-attendance-members-${today}.csv"`,
      "X-Content-Type-Options": "nosniff",
      "X-Export-Row-Count": String(members.length),
    },
  });
}

export async function GET(): Promise<Response> {
  return errorResponse((await getRequestDictionary()).errors.exportPostOnly, 405, {
    Allow: "POST",
  });
}
