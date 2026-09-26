import type { MemberListItem } from "@/lib/member-domain";
import { formatDate, type SupportedDateFormat } from "@/lib/dates";
import { formatPlural, getDictionary, type Locale } from "@/lib/i18n";
import type { Dictionary } from "@/lib/dictionaries/en";
import { STATUS, type MemberStatus } from "@/lib/constants";

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

/** The international form of a member's number, or null if there isn't a usable one. */
function whatsappPhone(
  member: Pick<MemberListItem, "phone">,
  countryCode: string,
): string | null {
  return member.phone ? normalizePhoneForWhatsApp(member.phone, countryCode) : null;
}

/**
 * The bare chat link — no message attached.
 *
 * Separate from the reminder rather than a flag on it, because the two answer
 * different questions. The reminder carries the parish's saved wording, and that
 * wording interpolates how many days late someone is, so putting it in front of
 * a person who is *within* their limit would tell them they are zero days
 * overdue. This one opens the conversation and lets the priest write, which is
 * the right thing for everyone else.
 */
export function buildWhatsAppContactUrl(
  member: Pick<MemberListItem, "phone">,
  options: { countryCode: string },
): string | null {
  const phone = whatsappPhone(member, options.countryCode);
  return phone ? `https://wa.me/${phone}` : null;
}

export function buildWhatsAppReminderUrl(
  member: Pick<MemberListItem, "name" | "phone" | "lastConfessionDate" | "nextDueDate" | "daysOverdue">,
  options: {
    template: string;
    countryCode: string;
    dateFormat: SupportedDateFormat;
    locale: Locale;
    dict: Dictionary;
  },
): string | null {
  const phone = whatsappPhone(member, options.countryCode);
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

/**
 * Whether this member is to be reminded, given a reminder link to offer.
 *
 * This is the one place the rule is written down, and it is written on the
 * server: the queries call it and set `reminderUrl` to `null` for everyone else,
 * so the page never carries the parish's saved wording for a member who is
 * within their limit. The three surfaces that render the link — the attention
 * queue, the roster row, and the member drawer — therefore test for the link's
 * presence and cannot disagree with each other about who gets it.
 *
 * The second half of the condition is not decoration. A member past their limit
 * with no phone number has no link to offer, and rendering a control that leads
 * nowhere is worse than rendering nothing: it looks like the message is ready and
 * waiting, and the failure only shows up after the click.
 *
 * It returns a boolean rather than the URL because the caller has to decide what
 * a `false` means — and at the one other call site, the member details, that is
 * `reminderUrl: null`. Making the function return the value would hide that
 * decision inside a name that says only whether.
 */
export function shouldOfferReminder(
  status: MemberStatus,
  reminderUrl: string | null,
): boolean {
  return status === STATUS.OVERDUE && reminderUrl !== null;
}

/**
 * Whether this member is to be offered the bare chat, given a link to offer.
 *
 * The same past-the-limit condition as the reminder, and for a different reason.
 * The reminder is withheld from a member inside their limit because the saved
 * wording would tell them they are zero days late. The bare link is withheld for
 * a plainer reason: it is a follow-up control, and a row full of them on members
 * who are on time says nothing to the person scanning the roster for who needs
 * chasing. Both decisions are made here, on the server, so the roster, the
 * attention queue and the drawer cannot disagree about who is being chased.
 *
 * The two gates are separate functions rather than one `shouldOfferWhatsApp`
 * because they are two decisions, not one: a member past the limit is offered
 * both, and collapsing them would make it impossible to offer the bare chat
 * without the saved wording — which is the combination that was actually wanted.
 *
 * Returns a boolean rather than the URL for the same reason `shouldOfferReminder`
 * does: the caller has to decide what a `false` means, and that decision belongs
 * at the call site rather than hidden inside a name that says only whether.
 */
export function shouldOfferContact(
  status: MemberStatus,
  whatsappUrl: string | null,
): boolean {
  return status === STATUS.OVERDUE && whatsappUrl !== null;
}
