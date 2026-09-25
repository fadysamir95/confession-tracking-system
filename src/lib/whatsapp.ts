import type { MemberListItem } from "@/lib/member-domain";
import { formatDate, type SupportedDateFormat } from "@/lib/dates";
import { formatPlural, getDictionary, type Locale } from "@/lib/i18n";
import type { Dictionary } from "@/lib/dictionaries/en";

/**
 * The reminder a brand new tenant starts with.
 *
 * A function of the locale rather than a constant, because this sentence is
 * addressed to a parishioner by name and will be read by a real human for
 * years. A new Coptic parish in Cairo should not have to open settings, select
 * an English paragraph, and delete it before writing their own Arabic greeting.
 */
export function defaultWhatsappTemplate(locale: Locale): string {
  return getDictionary(locale).settings.defaultTemplate;
}

export interface WhatsAppTemplateValues {
  name: string;
  lastConfessionDate: string;
  nextDueDate: string;
  daysOverdue: string;
}

export function normalizePhoneForWhatsApp(
  phone: string,
  defaultCountryCode: string,
): string | null {
  let digits = phone.replace(/\D/g, "");

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (phone.trim().startsWith("+")) {
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
  } else if (digits.startsWith("0") && /^\d+$/.test(defaultCountryCode)) {
    digits = `${defaultCountryCode.replace(/\D/g, "")}${digits.slice(1)}`;
  }

  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function renderWhatsAppTemplate(
  template: string,
  values: WhatsAppTemplateValues,
): string {
  return template.replace(
    /{{\s*(name|lastConfessionDate|nextDueDate|daysOverdue)\s*}}/g,
    (_, key: keyof WhatsAppTemplateValues) => values[key],
  );
}

export function buildWhatsAppUrl(
  member: Pick<MemberListItem, "name" | "phone" | "lastConfessionDate" | "nextDueDate" | "daysOverdue">,
  options: {
    template: string;
    countryCode: string;
    dateFormat: SupportedDateFormat;
    locale: Locale;
    dict: Dictionary;
  },
): string | null {
  if (!member.phone) {
    return null;
  }

  const phone = normalizePhoneForWhatsApp(member.phone, options.countryCode);
  if (!phone) {
    return null;
  }

  const { locale, dict } = options;

  // The three fallbacks below are part of the outgoing message, so they are
  // translated like any other interface text. A priest reading an Arabic
  // reminder should not find "not recorded" dropped into the middle of it.
  const message = renderWhatsAppTemplate(options.template, {
    name: member.name,
    lastConfessionDate: member.lastConfessionDate
      ? formatDate(member.lastConfessionDate, options.dateFormat, locale)
      : dict.whatsapp.notRecorded,
    nextDueDate: member.nextDueDate
      ? formatDate(member.nextDueDate, options.dateFormat, locale)
      : dict.whatsapp.notAvailable,
    daysOverdue: formatPlural(member.daysOverdue, locale, dict.days),
  });

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
