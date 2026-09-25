/**
 * A minimal ZIP reader, written against `DecompressionStream`.
 *
 * An `.xlsx` file is a ZIP archive of XML parts, and the browser already knows
 * how to inflate raw deflate — so the whole reader is about walking the archive
 * structure, not about compression. This exists to avoid a dependency: the
 * well-known spreadsheet libraries carry unpatched prototype-pollution and
 * regular-expression-denial-of-service advisories, and pulling one in to read a
 * two-column roster would put an unaudited parser in front of parish data for
 * no benefit. `xlsx` is deliberately absent from `package.json`.
 *
 * Only the two entry kinds an `.xlsx` needs are read (stored and deflate). Any
 * other compression method is refused by name rather than silently skipped.
 *
 * Nothing here is a security boundary on its own. It runs against a file the
 * user chose, in their own browser, and the only thing that leaves the browser
 * is a list of name and phone strings which the server re-validates field by
 * field regardless.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/**
 * Largest single entry we will inflate.
 *
 * This also bounds the XML handed to `DOMParser`, which is the value it needs:
 * the worksheet and the shared-string table are the only parts that get parsed,
 * and neither has any business being larger than a parish roster.
 */
const MAX_ENTRY_BYTES = 16 * 1024 * 1024;
/** Largest total inflated size across the archive. */
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;

export class SpreadsheetReadError extends Error {
  /** A closed set so the UI can translate the reason instead of showing a raw string. */
  readonly reason:
    | "notAZipFile"
    | "corruptArchive"
    | "unsupportedCompression"
    | "tooLarge"
    | "noWorksheet"
    | "malformedSheet";

  constructor(reason: SpreadsheetReadError["reason"]) {
    super(`spreadsheet:${reason}`);
    this.reason = reason;
  }
}

interface ZipEntry {
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function findEndOfCentralDirectory(view: DataView): number {
  // The comment field is a 16-bit length at the very end, so the record can sit
  // at most 65557 bytes back. Scanning is the only way to find it: a zip whose
  // prefix is not exactly aligned has no other anchor.
  const earliest = Math.max(0, view.byteLength - 0x10000 - 22);
  for (let offset = view.byteLength - 22; offset >= earliest; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  throw new SpreadsheetReadError("notAZipFile");
}

function readCentralDirectory(view: DataView): Map<string, ZipEntry> {
  const eocd = findEndOfCentralDirectory(view);
  let entryCount = view.getUint16(eocd + 10, true);
  let directoryOffset = view.getUint32(eocd + 16, true);

  // ZIP64. Offsets and counts are widened to 64 bits and their 32-bit slots
  // hold 0xffffffff, so the real values live in the ZIP64 end-of-directory
  // record just before the classic one. Excel only produces these above 4 GB,
  // which the size cap would reject anyway, but reading the flag keeps the
  // failure "too large" rather than "corrupt".
  if (entryCount === 0xffff || directoryOffset === 0xffffffff) {
    const locator = eocd - 20;
    if (locator >= 0 && view.getUint32(locator, true) === 0x07064b50) {
      const zip64 = Number(view.getBigUint64(locator + 8, true));
      if (zip64 >= 0 && zip64 + 56 <= view.byteLength) {
        entryCount = Number(view.getBigUint64(zip64 + 32, true));
        directoryOffset = Number(view.getBigUint64(zip64 + 48, true));
      }
    }
  }

  const entries = new Map<string, ZipEntry>();
  const decoder = new TextDecoder("utf-8");
  let cursor = directoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > view.byteLength) throw new SpreadsheetReadError("corruptArchive");
    if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) {
      throw new SpreadsheetReadError("corruptArchive");
    }

    const method = view.getUint16(cursor + 10, true);
    let compressedSize = view.getUint32(cursor + 20, true);
    let uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    let localHeaderOffset = view.getUint32(cursor + 42, true);

    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      // The ZIP64 extended information extra field (header id 0x0001) carries
      // the widened values in a fixed order, each present only when its
      // 32-bit slot was saturated.
      const extraStart = cursor + 46 + nameLength;
      let field = extraStart;
      while (field + 4 <= extraStart + extraLength) {
        const headerId = view.getUint16(field, true);
        const size = view.getUint16(field + 2, true);
        if (headerId === 0x0001) {
          let zipped = field + 4;
          if (uncompressedSize === 0xffffffff) {
            uncompressedSize = Number(view.getBigUint64(zipped, true));
            zipped += 8;
          }
          if (compressedSize === 0xffffffff) {
            compressedSize = Number(view.getBigUint64(zipped, true));
            zipped += 8;
          }
          if (localHeaderOffset === 0xffffffff) {
            localHeaderOffset = Number(view.getBigUint64(zipped, true));
          }
          break;
        }
        field += 4 + size;
      }
    }

    const name = decoder.decode(
      new Uint8Array(view.buffer, view.byteOffset + cursor + 46, nameLength),
    );
    entries.set(name, { method, compressedSize, uncompressedSize, localHeaderOffset });

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

async function inflateRaw(bytes: Uint8Array, expectedSize: number): Promise<Uint8Array> {
  // `DecompressionStream` is a streaming API: it must be fed the whole input
  // and closed, and the result collected, because there is no synchronous
  // variant. The expected size comes from the archive and is used to pre-grow
  // the output buffer rather than to trust it as a length.
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(
    new DecompressionStream("deflate-raw"),
  );
  const parts: Uint8Array[] = [];
  let total = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > Math.max(expectedSize, MAX_ENTRY_BYTES)) {
        await reader.cancel();
        throw new SpreadsheetReadError("tooLarge");
      }
      parts.push(value);
    }
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

async function readEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  if (entry.method === 0) {
    if (entry.compressedSize > MAX_ENTRY_BYTES) throw new SpreadsheetReadError("tooLarge");
    return bytes.slice(
      entry.localHeaderOffset,
      entry.localHeaderOffset + entry.compressedSize,
    );
  }
  if (entry.method === 8) {
    if (entry.uncompressedSize > MAX_ENTRY_BYTES) throw new SpreadsheetReadError("tooLarge");
    return inflateRaw(
      bytes.slice(
        entry.localHeaderOffset,
        entry.localHeaderOffset + entry.compressedSize,
      ),
      entry.uncompressedSize,
    );
  }
  // bzip2, LZMA, zstd, xz and friends: methods this reader has not been written
  // to handle. Saying so is better than returning an empty roster.
  throw new SpreadsheetReadError("unsupportedCompression");
}

/**
 * Inflates every entry in an archive, keyed by its path inside the zip.
 *
 * This is the whole archive layer, and it is exported as a unit because it is
 * the part that can be tested without a browser: the XML layer above it needs
 * `DOMParser`, while walking a central directory and inflating raw deflate is
 * ordinary byte work that a test can drive with a zip it builds itself.
 *
 * Every part is read rather than only the wanted ones. An `.xlsx` carries
 * thumbnails and document properties that are never needed, and inflating them
 * too is what makes the total-size guard mean something: a zip bomb is caught by
 * the sum, not by the largest single member.
 */
export async function readZipEntries(buffer: ArrayBuffer): Promise<Map<string, string>> {
  if (buffer.byteLength > MAX_ENTRY_BYTES * 4) throw new SpreadsheetReadError("tooLarge");

  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const entries = readCentralDirectory(view);

  let total = 0;
  for (const entry of entries.values()) {
    total += entry.uncompressedSize;
    if (total > MAX_TOTAL_BYTES) throw new SpreadsheetReadError("tooLarge");
  }

  const decoder = new TextDecoder("utf-8");
  const parts = new Map<string, string>();

  for (const [name, entry] of entries) {
    if (name.endsWith("/")) continue;

    // The local header repeats the name and extra-field lengths, and they are
    // allowed to differ from the central directory's copies, so the data offset
    // has to be measured from the local record rather than assumed.
    if (entry.localHeaderOffset + 30 > view.byteLength) {
      throw new SpreadsheetReadError("corruptArchive");
    }
    if (view.getUint32(entry.localHeaderOffset, true) !== LOCAL_SIGNATURE) {
      throw new SpreadsheetReadError("corruptArchive");
    }
    const nameLength = view.getUint16(entry.localHeaderOffset + 26, true);
    const extraLength = view.getUint16(entry.localHeaderOffset + 28, true);
    const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;
    if (dataStart + entry.compressedSize > view.byteLength) {
      throw new SpreadsheetReadError("corruptArchive");
    }

    parts.set(name, decoder.decode(await readEntry(bytes, { ...entry, localHeaderOffset: dataStart })));
  }

  return parts;
}

function parseXml(source: string): Document {
  // A DOCTYPE is refused outright. Browsers do not resolve external entities in
  // `DOMParser`, but entity-expansion bombs are still worth declining before
  // parsing rather than relying on that being true of every engine.
  if (/<!DOCTYPE/i.test(source)) throw new SpreadsheetReadError("malformedSheet");

  const document = new DOMParser().parseFromString(source, "application/xml");
  // `parseFromString` does not throw on bad XML; it returns a document whose
  // root is `<parsererror>`, so the check is on the document, not on an
  // exception. The querySelector is a belt-and-braces check for the engines that
  // bury the error deeper in the tree.
  const root = document.documentElement;
  if (!root || root.nodeName === "parsererror" || root.querySelector("parsererror")) {
    throw new SpreadsheetReadError("malformedSheet");
  }
  return document;
}

/**
 * The text of a `<si>` or `<is>` element: every `<t>` inside it, concatenated.
 *
 * Excel splits a run whenever a cell was edited or a chunk of it was formatted
 * differently, so a single shared string is routinely several sibling `<t>`
 * elements. Reading only the first is how a name silently loses its middle.
 */
function sharedStringText(element: Element | null): string {
  if (!element) return "";
  const parts: string[] = [];
  for (const node of element.getElementsByTagName("t")) parts.push(node.textContent ?? "");
  return parts.join("");
}

/** The raw text of the first `<v>` child: a number, an index, or a formula result. */
function valueText(cell: Element): string {
  return cell.getElementsByTagName("v")[0]?.textContent ?? "";
}

/** `"BC"` -> 54, i.e. the column reference of a cell into a zero-based index. */
function columnIndex(reference: string): number {
  let index = 0;
  for (const character of reference.toUpperCase()) {
    const code = character.charCodeAt(0);
    if (code < 65 || code > 90) break;
    index = index * 26 + (code - 64);
  }
  return Math.max(0, index - 1);
}

/**
 * Numbers arrive as text, and a phone number stored as a number is the normal
 * case rather than the exception. Integers print without a decimal point; other
 * values have their trailing zeros trimmed, because `12025550100` must not become
 * `12025550100.0` and then fail its own length check.
 */
function formatNumericCell(raw: string): string {
  const value = Number(raw.trim());
  if (!Number.isFinite(value)) return raw.trim();
  if (Number.isInteger(value)) return String(value);
  return String(value).replace(/\.?0+$/, "");
}

function readSharedStrings(xml: string): string[] {
  const document = parseXml(xml);
  return Array.from(document.getElementsByTagName("si"), (item) => sharedStringText(item));
}

/** The first worksheet part in archive order, as a fallback when rels are unusable. */
function firstWorksheetByName(parts: ReadonlyMap<string, string>): string | null {
  for (const name of parts.keys()) {
    if (/^xl\/worksheets\/[^/]+\.xml$/.test(name)) return name;
  }
  return null;
}

/**
 * Resolves the first worksheet in the workbook.
 *
 * The workbook's own sheet order is followed rather than "whatever
 * `sheet1.xml` is called", because a priest who reorders or renames tabs in
 * Excel should get the sheet they see first. When the relationship part is
 * missing or unreadable the first worksheet by archive order is used instead,
 * which is the right answer for the overwhelming majority of real files.
 */
function findFirstWorksheetName(parts: ReadonlyMap<string, string>): string | null {
  const workbookXml = parts.get("xl/workbook.xml");
  if (!workbookXml) return firstWorksheetByName(parts);

  const sheet = parseXml(workbookXml).getElementsByTagName("sheet")[0];
  // The relationship id lives in the `r` namespace, and `getAttribute` with a
  // qualified name works regardless of prefix, so writers that spell the prefix
  // differently are all covered by the one lookup plus the unprefixed fallback.
  const relationshipId =
    sheet?.getAttribute("r:id") ?? sheet?.getAttribute("relationshipId") ?? null;
  if (!relationshipId) return firstWorksheetByName(parts);

  const relsXml = parts.get("xl/_rels/workbook.xml.rels");
  if (!relsXml) return firstWorksheetByName(parts);

  for (const relationship of Array.from(
    parseXml(relsXml).getElementsByTagName("Relationship"),
  )) {
    if (relationship.getAttribute("Id") !== relationshipId) continue;
    const target = relationship.getAttribute("Target") ?? "";
    // Targets are relative to `xl/`, and some third-party writers climb out of it
    // with `../`, so the prefix is resolved rather than concatenated blindly.
    const resolved = target.startsWith("/")
      ? target.slice(1)
      : target.startsWith("../")
        ? target.replace(/^(\.\.\/)+/, "")
        : `xl/${target}`;
    if (parts.has(resolved)) return resolved;
  }

  return firstWorksheetByName(parts);
}

/**
 * Reads the first worksheet of an `.xlsx` into a rectangular grid of strings.
 *
 * Every cell becomes a string, because this reader has no business deciding
 * what a number means: a name column containing `12345` and a phone column
 * containing `01012345678` are both text as far as the import is concerned, and
 * the field validation that follows decides whether either is acceptable.
 */
export async function readXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const parts = await readZipEntries(buffer);

  const sheetName = findFirstWorksheetName(parts);
  if (!sheetName) throw new SpreadsheetReadError("noWorksheet");

  const sheetXml = parts.get(sheetName);
  if (sheetXml === undefined) throw new SpreadsheetReadError("noWorksheet");

  const sharedStringsXml = parts.get("xl/sharedStrings.xml");
  const sharedStrings = sharedStringsXml ? readSharedStrings(sharedStringsXml) : [];

  const sheet = parseXml(sheetXml);
  const grid: string[][] = [];

  for (const row of Array.from(sheet.getElementsByTagName("row"))) {
    const cells: string[] = [];
    let next = 0;

    for (const cell of Array.from(row.getElementsByTagName("c"))) {
      const reference = cell.getAttribute("r");
      // Without a reference, the position is whatever the previous cell left as
      // its successor. Sparse rows are common enough that guessing backwards
      // would silently shift an entire row.
      if (reference) next = columnIndex(reference);

      const type = cell.getAttribute("t");
      let text: string;

      switch (type) {
        case "s": {
          const index = Number(valueText(cell).trim());
          text = Number.isInteger(index) ? (sharedStrings[index] ?? "") : "";
          break;
        }
        case "inlineStr":
          text = sharedStringText(cell.getElementsByTagName("is")[0] ?? null);
          break;
        case "b":
          text = valueText(cell).trim() === "1" ? "TRUE" : "FALSE";
          break;
        case "e":
          // A formula error such as #N/A. It is not a value the parish typed, so
          // it is treated as empty and the row fails on its own merits rather
          // than importing the literal string "#N/A" as somebody's name.
          text = "";
          break;
        case "str":
        case "d":
          // A cached formula result, and an ISO date cell. Both are already text.
          text = valueText(cell).trim();
          break;
        default:
          text = formatNumericCell(valueText(cell));
      }

      cells[next] = text;
      next += 1;
    }

    grid.push(cells.map((cell) => cell ?? ""));
  }

  return grid;
}
