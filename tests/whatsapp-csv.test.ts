import { describe, expect, it } from "vitest";
import {
  buildWhatsAppContactUrl,
  buildWhatsAppReminderUrl,
  defaultWhatsappTemplate,
  normalizePhoneForWhatsApp,
  shouldOfferReminder,
} from "@/lib/whatsapp";
import { STATUS } from "@/lib/constants";
import { createCsv, escapeCsvCell } from "@/lib/csv";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";

describe("WhatsApp links", () => {
  it("normalizes Egyptian local and international phone numbers", () => {
    expect(normalizePhoneForWhatsApp("01012345678", "20")).toBe("201012345678");
    expect(normalizePhoneForWhatsApp("+20 101 234 5678", "20")).toBe("201012345678");
    expect(normalizePhoneForWhatsApp("001 202 555 0100", "20")).toBe("12025550100");
  });

  it("builds an encoded, content-free reminder URL", () => {
    const url = buildWhatsAppReminderUrl(
      {
        name: "John Doe",
        phone: "01012345678",
        lastConfessionDate: "2026-08-15",
        nextDueDate: "2026-09-14",
        daysOverdue: 11,
      },
      {
        template: "Hello {{name}}, due {{nextDueDate}}, {{daysOverdue}} overdue.",
        countryCode: "20",
        dateFormat: "DD/MM/YYYY",
        locale: "en",
        dict: getDictionary("en"),
      },
    );
    expect(url).toContain("https://wa.me/201012345678?text=");
    expect(decodeURIComponent(url ?? "")).toContain(
      "Hello John Doe, due 14/09/2026, 11 days overdue.",
    );
  });

  /**
   * The three substituted fallbacks are part of the outgoing message, so they
   * are translated with everything else. Before this was plumbed through, an
   * Arabic reminder could arrive with the English words "not recorded" dropped
   * into the middle of it.
   */
  it("substitutes the missing-date fallbacks in the reader's language", () => {
    const english = buildWhatsAppReminderUrl(
      {
        name: "John Doe",
        phone: "01012345678",
        lastConfessionDate: null,
        nextDueDate: null,
        daysOverdue: 0,
      },
      {
        template: "{{name}}: last {{lastConfessionDate}}, next {{nextDueDate}}, {{daysOverdue}}",
        countryCode: "20",
        dateFormat: "DD/MM/YYYY",
        locale: "en",
        dict: getDictionary("en"),
      },
    );
    expect(decodeURIComponent(english ?? "")).toContain("not recorded");
    expect(decodeURIComponent(english ?? "")).toContain("0 days");

    const arabic = buildWhatsAppReminderUrl(
      {
        name: "John Doe",
        phone: "01012345678",
        lastConfessionDate: null,
        nextDueDate: null,
        daysOverdue: 0,
      },
      {
        template: "{{name}}: last {{lastConfessionDate}}, next {{nextDueDate}}, {{daysOverdue}}",
        countryCode: "20",
        dateFormat: "DD/MM/YYYY",
        locale: "ar",
        dict: getDictionary("ar"),
      },
    );
    const decoded = decodeURIComponent(arabic ?? "");
    expect(decoded).toContain("غير مسجَّل");
    expect(decoded).not.toContain("not recorded");
  });

  it("uses the Arabic plural form for a count inside the message", () => {
    // 2 in Arabic takes the "two" form (يومان), not the "other" form, which is
    // the single most visible way a hand-rolled count reveals a machine
    // translation.
    const url = buildWhatsAppReminderUrl(
      {
        name: "John Doe",
        phone: "01012345678",
        lastConfessionDate: "2026-08-15",
        nextDueDate: "2026-08-17",
        daysOverdue: 2,
      },
      {
        template: "{{daysOverdue}}",
        countryCode: "20",
        dateFormat: "DD/MM/YYYY",
        locale: "ar",
        dict: getDictionary("ar"),
      },
    );
    // Read back through the URL rather than decoded by hand, so the assertion
    // is about the message the recipient's phone will actually show.
    expect(new URL(url ?? "").searchParams.get("text")).toBe("يومان");
  });

  it("starts a new tenant in the language of the person creating it", () => {
    const locales: Locale[] = ["en", "ar"];
    const templates = locales.map(defaultWhatsappTemplate);
    expect(templates[0]).not.toBe(templates[1]);
    for (const template of templates) {
      expect(template).toContain("{{name}}");
      // The default stays free of attendance dates: a prefilled third-party URL
      // exposes its contents, so dates are an explicit opt-in.
      expect(template).not.toContain("{{nextDueDate}}");
      expect(template).not.toContain("{{lastConfessionDate}}");
    }
  });
});

/**
 * The plain chat link, as a contract of its own rather than a comment on the
 * reminder.
 *
 * "With no message" has to be checked as a *query* fact and not merely by
 * eyeballing the string, because a `?text=` that slipped back in would be
 * invisible in review and would put the parish's saved wording — which names a
 * member — into a link shown to people who are not overdue. A trailing `?` would
 * be harmless but untidy, so the URL is compared whole.
 */
describe("bare WhatsApp contact links", () => {
  it("is the chat and nothing else", () => {
    const url = buildWhatsAppContactUrl({ phone: "01012345678" }, { countryCode: "20" });
    expect(url).toBe("https://wa.me/201012345678");
    expect(url).not.toContain("?");
    expect(new URL(url ?? "").searchParams.get("text")).toBeNull();
  });

  it("is offered to anyone with a usable number, and to no one without one", () => {
    // Normalization is shared with the reminder, so the two can never disagree
    // about which members are reachable.
    expect(buildWhatsAppContactUrl({ phone: "+20 101 234 5678" }, { countryCode: "20" })).toBe(
      "https://wa.me/201012345678",
    );
    expect(buildWhatsAppContactUrl({ phone: null }, { countryCode: "20" })).toBeNull();
    // One digit is not a phone number, and a link built from it would open
    // WhatsApp pointed at nobody.
    expect(buildWhatsAppContactUrl({ phone: "5" }, { countryCode: "20" })).toBeNull();
  });
});

/**
 * Who gets the reminder, stated once and checked for every status.
 *
 * The saved message interpolates how many days late someone is. Handing it to a
 * member who is not late does not merely look odd — it tells a parishioner, in
 * the priest's own words, that they are zero days overdue, and it does so from a
 * button labelled "remind". The queries set `reminderUrl` to null for everyone
 * this rejects, so the wording never reaches the browser at all; this is the test
 * that keeps it that way.
 *
 * The statuses are walked rather than the two interesting cases sampled, so that
 * a status added later inherits no reminder by default and fails here instead.
 */
describe("who is offered the reminder", () => {
  const link = "https://wa.me/201012345678?text=hello";

  it("offers it only past the limit", () => {
    expect(shouldOfferReminder(STATUS.OVERDUE, link)).toBe(true);
    for (const status of [STATUS.ACTIVE, STATUS.DUE_SOON, STATUS.NEVER_RECORDED]) {
      expect(shouldOfferReminder(status, link)).toBe(false);
    }
  });

  it("offers it to nobody without a link to offer", () => {
    // A late member with no number must not render a control that leads nowhere;
    // a null URL is a real state, not a hypothetical one.
    expect(shouldOfferReminder(STATUS.OVERDUE, null)).toBe(false);
  });

  it("is not a status the caller can be talked out of by supplying a link", () => {
    // The rule is a conjunction, so this is what keeps it one: an `||` here would
    // pass both tests above and hand the saved message to the whole parish.
    expect(shouldOfferReminder(STATUS.ACTIVE, link)).toBe(false);
    expect(shouldOfferReminder(STATUS.NEVER_RECORDED, link)).toBe(false);
  });
});

describe("safe CSV export", () => {
  it("prevents spreadsheet formula injection", () => {
    expect(escapeCsvCell("=HYPERLINK(\"bad\")")).toBe(
      '"\'=HYPERLINK(""bad"")"',
    );
    expect(escapeCsvCell("  =SUM(1,2)")).toBe('"\'  =SUM(1,2)"');
  });

  it("quotes commas, quotes, and line breaks", () => {
    expect(createCsv(["Name"], [["John, Jr.\nSecond line"]])).toBe(
      '"Name"\r\n"John, Jr.\nSecond line"',
    );
  });
});
