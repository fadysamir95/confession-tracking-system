import "server-only";
import { DEFAULT_SETTINGS, defaultSettings } from "@/lib/constants";
import type { SupportedDateFormat } from "@/lib/dates";
import type { Locale } from "@/lib/i18n";
import { defaultWhatsappTemplate } from "@/lib/whatsapp";
import { withTenant } from "@/server/db";

export interface AppSettings {
  tenantId: string;
  defaultIntervalDays: number;
  dueSoonThresholdDays: number;
  timezone: string;
  dateFormat: SupportedDateFormat;
  whatsappCountryCode: string;
  whatsappTemplate: string;
  updatedAt: Date;
}

/**
 * Reads one tenant's settings.
 *
 * The tenant id is a required parameter and every caller supplies it from
 * `TenantContext`, never from the request. Combined with the Row-Level Security
 * policies on this table, a wrong or hostile id cannot surface another
 * tenant's WhatsApp template even if a caller passed one.
 *
 * A missing row yields the documented defaults rather than throwing. Under RLS
 * a row belonging to somebody else is indistinguishable from a row that does
 * not exist, so this fallback can only ever produce a fresh set of defaults.
 * It can never fall back to another tenant's configuration.
 */
export async function getSettings(tenantId: string, locale: Locale): Promise<AppSettings> {
  return withTenant(tenantId, async (db) => {
    const settings = await db.tenantSettings.findUnique({ where: { tenantId } });
    if (!settings) {
      // The reminder default is in the reader's language, so a tenant whose
      // settings row is missing gets copy they can actually read rather than a
      // paragraph in the other one.
      return {
        ...defaultSettings(defaultWhatsappTemplate(locale)),
        tenantId,
        updatedAt: new Date(0),
        dateFormat: DEFAULT_SETTINGS.dateFormat as SupportedDateFormat,
      };
    }

    return {
      ...settings,
      dateFormat: settings.dateFormat as SupportedDateFormat,
    };
  });
}

export interface SettingsUpdate {
  defaultIntervalDays: number;
  dueSoonThresholdDays: number;
  timezone: string;
  dateFormat: string;
  whatsappCountryCode: string;
  whatsappTemplate: string;
}

export async function updateSettings(
  tenantId: string,
  update: SettingsUpdate,
): Promise<void> {
  await withTenant(tenantId, async (db) => {
    await db.tenantSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        defaultIntervalDays: update.defaultIntervalDays,
        dueSoonThresholdDays: update.dueSoonThresholdDays,
        timezone: update.timezone,
        dateFormat: update.dateFormat,
        whatsappCountryCode: update.whatsappCountryCode,
        whatsappTemplate: update.whatsappTemplate,
      },
      update: {
        defaultIntervalDays: update.defaultIntervalDays,
        dueSoonThresholdDays: update.dueSoonThresholdDays,
        timezone: update.timezone,
        dateFormat: update.dateFormat,
        whatsappCountryCode: update.whatsappCountryCode,
        whatsappTemplate: update.whatsappTemplate,
      },
    });
  });
}
