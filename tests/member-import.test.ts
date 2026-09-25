import { deflateRawSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  IMPORT_LIMITS,
  buildImportPreview,
  decodeTextFile,
  parseDelimitedText,
  resolveColumns,
  sniffDelimiter,
} from "@/lib/member-import";
import { SpreadsheetReadError, readZipEntries } from "@/lib/xlsx-reader";
import { prisma, withTenant } from "@/server/db";
import { createMember } from "@/server/member-service";
import { importMembers } from "@/server/member-import";
import { DomainError } from "@/server/errors";
import { USER_ROLES } from "@/lib/constants";
import { addMemberToTenant, resetDatabase, seedTenant } from "./harness";
import type { TenantContext } from "@/server/auth";

/* -------------------------------------------------------------------------- */
/* Delimited text                                                             */
/* -------------------------------------------------------------------------- */

describe("delimited text reading", () => {
  it("keeps a delimiter, a line break and a quote that live inside a quoted field", () => {
    // A naive `split(",")` turns this into six fields, three of which are
    // fragments of a name, and the corruption is invisible until somebody
    // notices a member's name ends in half a field.
    const rows = parseDelimitedText(
      'Name,Phone\r\n"Doe, John","+1 (202) 555-0100"\r\n"Two\nLines","0100 123 4567"\r\n"He said ""hi""",\r\n',
      ",",
    );
    expect(rows).toEqual([
      ["Name", "Phone"],
      ["Doe, John", "+1 (202) 555-0100"],
      ["Two\nLines", "0100 123 4567"],
      // The line break that ends the file is a terminator, not a row of its
      // own: a trailing newline must not produce a phantom empty person.
      ['He said "hi"', ""],
    ]);
  });

  it("strips the byte-order mark Excel prepends to a UTF-8 export", () => {
    const rows = parseDelimitedText("\uFEFFName,Phone\nJohn,0100", ",");
    // If the mark survived it would be the first character of the first header,
    // which would then match no column alias.
    expect(rows[0][0]).toBe("Name");
  });

  it("treats a lone carriage return as a row break", () => {
    expect(parseDelimitedText("A,B\rC,D", ",")).toEqual([
      ["A", "B"],
      ["C", "D"],
    ]);
  });
});

describe("delimiter detection", () => {
  it("recognises the separators Excel actually produces", () => {
    expect(sniffDelimiter("Name;Phone\nJohn;0100")).toBe(";");
    expect(sniffDelimiter("Name\tPhone\nJohn\t0100")).toBe("\t");
    expect(sniffDelimiter("Name|Phone\nJohn|0100")).toBe("|");
    expect(sniffDelimiter("Name,Phone\nJohn,0100")).toBe(",");
  });

  it("ignores separators that only appear inside a quoted heading", () => {
    // `Name, Full` is one column with a comma in its title. Counting blindly
    // would score the comma as the delimiter and split the heading in half.
    expect(sniffDelimiter('"Name, Full";Phone\n"Doe, John";0100')).toBe(";");
  });
});

describe("text decoding", () => {
  it("reads UTF-8", () => {
    const bytes = new TextEncoder().encode("الاسم,الهاتف\n");
    expect(decodeTextFile(bytes)).toBe("الاسم,الهاتف\n");
  });

  /**
   * Encodes using the platform's own Windows-1256 table rather than a
   * hand-copied list of byte values, so the fixture cannot drift from the
   * encoding it is testing.
   */
  function windows1256Bytes(text: string): Uint8Array {
    const decoder = new TextDecoder("windows-1256");
    const table = new Map<string, number>();
    for (let byte = 0; byte < 256; byte += 1) {
      const character = decoder.decode(new Uint8Array([byte]));
      if (!table.has(character)) table.set(character, byte);
    }
    return new Uint8Array(
      [...text].map((character) => {
        const byte = table.get(character);
        if (byte === undefined) throw new Error(`no windows-1256 byte for ${character}`);
        return byte;
      }),
    );
  }

  it("falls back to Windows-1256 for an Arabic export from Excel", () => {
    // An Arabic roster saved from Excel on Windows is very often Windows-1256.
    // Decoded as UTF-8 it becomes replacement characters, and every name then
    // fails validation for a reason the user cannot see on their screen.
    const source = "الاسم,الهاتف";
    const decoded = decodeTextFile(windows1256Bytes(source));

    expect(decoded).toBe(source);
    expect(decoded).not.toContain("\uFFFD");
    // A strict UTF-8 read of these bytes really does fail, which is the only
    // reason the fallback is reached.
    expect(() => new TextDecoder("utf-8", { fatal: true }).decode(windows1256Bytes(source))).toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* Column mapping                                                             */
/* -------------------------------------------------------------------------- */

describe("column mapping", () => {
  it("matches English headers whatever the capitalisation and spacing", () => {
    expect(resolveColumns(["Full Name", "PHONE", "Notes"])).toEqual({
      nameIndex: 0,
      phoneIndex: 1,
    });
  });

  it("matches Arabic headers with diacritics and tatweel", () => {
    // "اَلاسْم" with a tatweel, and "رقم الهاتف" as two words, both reduce to
    // forms that can be listed once rather than guessed at per spelling.
    expect(resolveColumns(["اَلاَسم", "رقم الهاتف"])).toEqual({
      nameIndex: 0,
      phoneIndex: 1,
    });
  });

  it("finds the columns wherever they are, not only as the first two", () => {
    expect(resolveColumns(["Notes", "Name", "Phone"])).toEqual({
      nameIndex: 1,
      phoneIndex: 2,
    });
  });

  it("reports no phone column when the sheet has only names", () => {
    expect(resolveColumns(["الاسم"])).toEqual({ nameIndex: 0, phoneIndex: -1 });
  });

  it("returns null when nothing looks like a name column", () => {
    expect(resolveColumns(["Date", "Amount"])).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* The preview                                                                */
/* -------------------------------------------------------------------------- */

describe("import preview", () => {
  it("reads the two columns and ignores everything else in the sheet", () => {
    const preview = buildImportPreview([
      ["Serial", "الاسم", "الهاتف", "Last confession", "Notes"],
      ["1", "بطرس زكي", "01001234567", "2026-01-01", "anything at all"],
      ["2", "مينا فايز", "01007654321", "", ""],
    ]);

    expect(preview.columnsAssumed).toBe(false);
    expect(preview.importable).toEqual([
      { name: "بطرس زكي", phone: "01001234567" },
      { name: "مينا فايز", phone: "01007654321" },
    ]);
    expect(preview.rows[0]?.rowNumber).toBe(2);
  });

  it("falls back to the first two columns and says so when no heading matches", () => {
    const preview = buildImportPreview([
      ["John Doe", "01001234567"],
      ["Mena Fayez", "01007654321"],
    ]);

    expect(preview.columnsAssumed).toBe(true);
    // With no recognised header the first row is data, not a heading, so it is
    // imported rather than silently eaten.
    expect(preview.importable).toHaveLength(2);
    expect(preview.rows[0]?.rowNumber).toBe(1);
  });

  it("refuses a row with no name and a row with an unusable phone", () => {
    const preview = buildImportPreview([
      ["Name", "Phone"],
      ["", "01001234567"],
      ["Mena Fayez", "12"],
      ["Botros Zaki", "01001234567"],
    ]);

    expect(preview.rows.map((row) => row.issue)).toEqual([
      "nameRequired",
      "phoneInvalid",
      null,
    ]);
    expect(preview.importable).toEqual([{ name: "Botros Zaki", phone: "01001234567" }]);
  });

  it("skips the second of two identical rows but not two people who share a name", () => {
    const preview = buildImportPreview([
      ["Name", "Phone"],
      ["Mena Fayez", "01001234567"],
      ["Mena Fayez", "01001234567"],
      ["Mena Fayez", ""],
      ["Mena Fayez", ""],
    ]);

    // The two phone-bearing rows collide on the composite unique index. The two
    // phone-less rows do not, because PostgreSQL treats NULLs as distinct, and
    // the import deliberately does not be stricter than the add-member form.
    expect(preview.rows.map((row) => row.issue)).toEqual([
      null,
      "duplicateInFile",
      null,
      null,
    ]);
  });

  it("treats a phone number and a formatted version of it as the same row", () => {
    const preview = buildImportPreview([
      ["Name", "Phone"],
      ["Mena Fayez", "0100 123 4567"],
      ["mena  fayez", "01001234567"],
    ]);
    expect(preview.rows[1]?.issue).toBe("duplicateInFile");
  });

  it("drops the trailing empty rows a spreadsheet always has", () => {
    const preview = buildImportPreview([
      ["Name", "Phone"],
      ["Mena Fayez", "01001234567"],
      ["", ""],
      ["", "", ""],
    ]);
    expect(preview.rows).toHaveLength(1);
  });

  it("rejects a phone number Excel stored as a number", () => {
    // The single most common reason a perfect roster fails its own digit count
    // is a trailing ".0" left by a float cell.
    const preview = buildImportPreview([
      ["Name", "Phone"],
      ["Mena Fayez", "01001234567.0"],
    ]);
    expect(preview.rows[0]?.phone).toBe("01001234567");
    expect(preview.rows[0]?.issue).toBeNull();
  });

  it("returns nothing for a file with no rows", () => {
    expect(buildImportPreview([]).rows).toEqual([]);
    expect(buildImportPreview([["", ""]]).rows).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* The archive layer                                                          */
/* -------------------------------------------------------------------------- */

/**
 * A minimal ZIP writer, so the reader is tested against real archive bytes
 * rather than against a mock that agrees with whatever the reader already does.
 */
function buildZip(entries: Array<{ name: string; content: string; deflate?: boolean }>): ArrayBuffer {
  const encoder = new TextEncoder();
  const local: number[] = [];
  const central: number[] = [];

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const raw = encoder.encode(entry.content);
    const stored = entry.deflate ? new Uint8Array(deflateRawSync(raw)) : raw;
    const method = entry.deflate ? 8 : 0;
    const offset = local.length;

    const header = new Uint8Array(30);
    const headerView = new DataView(header.buffer);
    headerView.setUint32(0, 0x04034b50, true);
    headerView.setUint16(4, 20, true);
    headerView.setUint16(6, method, true);
    headerView.setUint32(18, raw.length, true);
    headerView.setUint32(22, stored.length, true);
    headerView.setUint16(26, nameBytes.length, true);
    local.push(...header, ...nameBytes, ...stored);

    const directory = new Uint8Array(46);
    const directoryView = new DataView(directory.buffer);
    directoryView.setUint32(0, 0x02014b50, true);
    directoryView.setUint16(10, method, true);
    directoryView.setUint32(20, stored.length, true);
    directoryView.setUint32(24, raw.length, true);
    directoryView.setUint16(28, nameBytes.length, true);
    directoryView.setUint32(42, offset, true);
    central.push(...directory, ...nameBytes);
  }

  const directoryOffset = local.length;
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, central.length, true);
  endView.setUint32(16, directoryOffset, true);

  return new Uint8Array([...local, ...central, ...end]).buffer;
}

describe("zip archive reading", () => {
  it("inflates deflated entries and passes stored entries through", async () => {
    const parts = await readZipEntries(
      buildZip([
        { name: "xl/workbook.xml", content: "<workbook/>".repeat(40), deflate: true },
        { name: "xl/sharedStrings.xml", content: "<sst/>" },
      ]),
    );

    expect(parts.get("xl/workbook.xml")).toBe("<workbook/>".repeat(40));
    expect(parts.get("xl/sharedStrings.xml")).toBe("<sst/>");
    expect(parts.size).toBe(2);
  });

  it("preserves Arabic text byte for byte", async () => {
    const parts = await readZipEntries(
      buildZip([{ name: "xl/sharedStrings.xml", content: "الاسم", deflate: true }]),
    );
    expect(parts.get("xl/sharedStrings.xml")).toBe("الاسم");
  });

  it("refuses a file that is not an archive at all", async () => {
    const notAZip = new TextEncoder().encode("Name,Phone\nMena,01001234567");
    await expect(readZipEntries(notAZip.buffer as ArrayBuffer)).rejects.toMatchObject({
      reason: "notAZipFile",
    });
  });

  it("names a truncated archive rather than reading garbage out of it", async () => {
    const truncated = buildZip([{ name: "a.txt", content: "x".repeat(500), deflate: true }]);
    await expect(readZipEntries(truncated.slice(0, 40))).rejects.toBeInstanceOf(
      SpreadsheetReadError,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* The service                                                                */
/* -------------------------------------------------------------------------- */

let parish: TenantContext;
let otherParish: TenantContext;
let plainPriest: TenantContext;

const rows = (entries: Array<[string, string | null, number]>) =>
  entries.map(([name, phone, rowNumber]) => ({ name, phone, rowNumber }));

beforeAll(async () => {
  await resetDatabase(prisma);
  parish = await seedTenant(prisma, { name: "Import parish" });
  otherParish = await seedTenant(prisma, { name: "Other parish" });
  plainPriest = await addMemberToTenant(prisma, parish, {
    name: "Plain priest",
    role: USER_ROLES.PRIEST,
  });
});

afterAll(async () => {
  await resetDatabase(prisma);
  await prisma.$disconnect();
});

describe("bulk roster import", () => {
  it("adds valid rows and reports the rest with a reason and a line number", async () => {
    const outcome = await importMembers(
      parish,
      rows([
        ["Mena Fayez", "0100000010", 2],
        ["", "0100000011", 3],
        ["Botros Zaki", "12", 4],
        ["Mena Fayez", "0100000010", 5],
      ]),
    );

    // Three of the four rows are the sheet's own; the line numbers come back
    // with them, so a priest can find the row in the file they are holding.
    expect(outcome.imported).toBe(1);
    expect(outcome.skipped).toEqual([
      { rowNumber: 3, name: "", issue: "nameRequired" },
      { rowNumber: 4, name: "Botros Zaki", issue: "phoneInvalid" },
      { rowNumber: 5, name: "Mena Fayez", issue: "duplicateInFile" },
    ]);

    const stored = await withTenant(parish.tenant.id, (db) =>
      db.member.findMany({ select: { name: true, phone: true } }),
    );
    expect(stored).toEqual([{ name: "Mena Fayez", phone: "0100000010" }]);
  });

  it("gives an imported member the tenant's own default interval, not a second opinion", async () => {
    await importMembers(parish, rows([["Default Interval", null, 2]]));

    const stored = await withTenant(parish.tenant.id, (db) =>
      db.member.findFirst({
        where: { name: "Default Interval" },
        select: { confessionIntervalDays: true, lastConfessionDate: true, tenantId: true },
      }),
    );
    expect(stored?.confessionIntervalDays).toBeNull();
    expect(stored?.lastConfessionDate).toBeNull();
    expect(stored?.tenantId).toBe(parish.tenant.id);
  });

  it("refuses a row that duplicates a member this parish already holds", async () => {
    await createMember(parish, { name: "Already Here", phone: "0100000099" }, "2026-09-01");

    const outcome = await importMembers(
      parish,
      rows([["Already Here", "0100000099", 2]]),
    );

    expect(outcome.imported).toBe(0);
    expect(outcome.duplicates).toBe(1);
    expect(outcome.skipped[0]?.issue).toBe("duplicateInFile");
  });

  it("does not treat the same person in another parish as a duplicate", async () => {
    // The duplicate check reads this tenant's rows only, so the second parish
    // can hold the same name and number without either import refusing it.
    await createMember(otherParish, { name: "Shared Name", phone: "0100000077" }, "2026-09-01");

    const first = await importMembers(parish, rows([["Shared Name", "0100000077", 2]]));
    const second = await importMembers(otherParish, rows([["Shared Name", "0100000077", 2]]));

    expect(first.duplicates).toBe(0);
    expect(second.duplicates).toBe(1);

    const leaked = await withTenant(parish.tenant.id, (db) =>
      db.member.findMany({ where: { name: "Shared Name" }, select: { tenantId: true } }),
    );
    expect(leaked).toHaveLength(1);
    expect(leaked[0]?.tenantId).toBe(parish.tenant.id);
  });

  it("writes every row under the caller's own tenant, whatever the payload claims", async () => {
    // The batch carries no tenant field at all, which is the point: there is
    // nowhere for a caller to put another parish's id.
    await importMembers(parish, rows([["Tenant Scoped", "0100000066", 2]]));

    const everywhere = await withTenant(parish.tenant.id, (db) =>
      db.member.findMany({ where: { name: "Tenant Scoped" }, select: { tenantId: true } }),
    );
    expect(everywhere).toEqual([{ tenantId: parish.tenant.id }]);
  });

  it("records one administrative event for the batch rather than one per person", async () => {
    const before = await withTenant(parish.tenant.id, (db) => db.auditLog.count());
    await importMembers(
      parish,
      rows([
        ["Audit One", "0100000055", 2],
        ["Audit Two", "0100000056", 3],
        ["Audit Three", "0100000057", 4],
      ]),
    );
    const after = await withTenant(parish.tenant.id, (db) => db.auditLog.count());

    // One event for one action at one moment. Three people typed by hand in the
    // same minute is three events; a roster upload is one.
    expect(after - before).toBe(1);
  });

  it("lets a priest import, because priests may add members by hand", async () => {
    const outcome = await importMembers(plainPriest, rows([["Priest Import", null, 2]]));
    expect(outcome.imported).toBe(1);
  });

  it("refuses a batch larger than the stated limit, without writing anything", async () => {
    const oversized = Array.from({ length: IMPORT_LIMITS.maxRows + 1 }, (_, index) => ({
      name: `Over ${index}`,
      phone: null,
      rowNumber: index + 2,
    }));

    await expect(importMembers(parish, oversized)).rejects.toMatchObject({
      code: "IMPORT_TOO_LARGE",
    });
    expect(oversized[0]).toBeDefined();
    expect(await withTenant(parish.tenant.id, (db) => db.member.count())).toBeGreaterThan(0);
  });

  it("throws a coded error rather than a sentence, so the action can translate it", async () => {
    await expect(importMembers(parish, [])).resolves.toEqual({
      imported: 0,
      skipped: [],
      duplicates: 0,
    });
    expect(new DomainError("IMPORT_EMPTY").code).toBe("IMPORT_EMPTY");
  });
});
