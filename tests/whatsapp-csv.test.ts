import { describe, expect, it } from "vitest";
import { buildWhatsAppUrl, defaultWhatsappTemplate, normalizePhoneForWhatsApp } from "@/lib/whatsapp";
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
    const url = buildWhatsAppUrl(
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
    const english = buildWhatsAppUrl(
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

    const arabic = buildWhatsAppUrl(
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
    const url = buildWhatsAppUrl(
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
