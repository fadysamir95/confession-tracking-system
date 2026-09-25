// Scans the source tree for text that mixes scripts it has no business mixing.
//
// The Arabic strings in this project have been corrupted more than once during
// authoring — a stray French phrase, a stray Chinese phrase, a CJK character in
// a comment — and every one of those failures is invisible to the type checker,
// because a wrong string is still a string. It reaches a priest as a page with
// one word in the wrong language on it.
//
// Only lines that already contain an Arabic letter are examined, because a line
// with no Arabic in it cannot have Arabic contamination. That keeps the report
// about the thing it is actually for.
//
// Two kinds of finding, and the difference matters:
//
//   1. A character from a script that has no place in this codebase at all —
//      Cyrillic, Greek, CJK, Hangul, Devanagari. There is no judgement call.
//      These are always corruption.
//
//   2. A run of Latin letters inside an Arabic sentence. This *is* a judgement
//      call, because `Argon2id` and `.xlsx` are legitimate and a stray English
//      clause is not, and no amount of pattern matching tells the two apart.
//      The allowlist below is the record of which Latin tokens have been
//      looked at and accepted. A new one is added only after a human has read
//      it in context, which is the point: it forces the reading.

import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIRECTORIES = ["src", "prisma", "scripts", "tests"];

/**
 * Non-Arabic characters that are nonetheless correct in an Arabic sentence.
 *
 * The bidi marks are the interesting ones. An Arabic sentence that ends in a
 * Latin file extension — `.xlsx`, `.csv` — needs a left-to-right mark after the
 * full stop, or the browser reorders the dot and renders `.xlsx` as `xlsx.`.
 * That is the same problem the stylesheet solves with `unicode-bidi: isolate`
 * for values a person types, which cannot carry a mark.
 */
const ALLOWED = new Set([
  0x00a0, // no-break space
  0x00ab, // « guillemet
  0x00b7, // · middle dot, as a separator in sort options
  0x00bb, // » guillemet
  0x00c0, 0x00c1, 0x00c2, // Latin letters with accents, in borrowed names
  0x200e, // ‎ left-to-right mark
  0x200f, // ‏ right-to-left mark
  0x2010, // ‐ hyphen
  0x2013, // – en dash
  0x2014, // — em dash
  0x2018, 0x2019, // ' ' single quotes
  0x201c, 0x201d, // " " double quotes
  0x2026, // … ellipsis
  0x2039, 0x203a, // ‹ › single guillemets
  0x2190, // ← arrow, in sort options
  0x2122, // ™
]);

/** Punctuation and ASCII, which say nothing about a translation. */
const IGNORED = new Set([...` \t.,:;!?()[]{}<>"'\`~@#$%^&*_+=|\\/-\u00a0`]);

/**
 * Latin tokens that have been read in context and accepted.
 *
 * Every entry needs a reason. If you cannot write the reason, the token is
 * corruption.
 */
const LATIN_ALLOWED = new Map([
  ["Argon2id", "the hashing algorithm, named in the security copy"],
  ["argon2id", "the hashing algorithm, lower-cased mid-sentence"],
  ["Next", "the framework, named in the deployment copy"],
  ["Action", "as in Next.js Server Actions"],
  ["xlsx", "the spreadsheet format, as a file extension"],
  ["xls", "the legacy spreadsheet format, as a file extension"],
  ["csv", "the delimited-text format, as a file extension"],
  ["txt", "the plain-text format, as a file extension"],
  ["UTC", "the timezone, which is not localised"],
  ["POST", "the HTTP verb, which is not localised"],
  ["GET", "the HTTP verb, which is not localised"],
  ["RLS", "row-level security, the term the project uses"],
  ["PDF", "the document format, which is not localised"],
  ["SQL", "the query language, which is not localised"],
  ["id", "as in a value placeholder"],
  ["GB", "as in a data volume"],
  ["MB", "as in a data volume"],
  ["ms", "as in a duration"],
  ["UI", "as in the interface"],
  ["FAQ", "as a heading"],
  ["CSV", "the delimited-text format, which is not localised"],
  ["YYYY", "part of the machine date format a CSV column header advertises"],
  ["MM", "part of the machine date format a CSV column header advertises"],
  ["DD", "part of the machine date format a CSV column header advertises"],
]);

/** The whole Arabic Unicode blocks, marks and punctuation included. */
function isArabic(code) {
  return (
    (code >= 0x0600 && code <= 0x06ff) || // Arabic
    (code >= 0x0750 && code <= 0x077f) || // Arabic Supplement
    (code >= 0x08a0 && code <= 0x08ff) || // Arabic Extended-A
    (code >= 0xfb50 && code <= 0xfdff) || // Presentation Forms-A
    (code >= 0xfe70 && code <= 0xfeff) // Presentation Forms-B
  );
}

/**
 * The contents of the string literals on one line.
 *
 * Only the contents, never the line. A dictionary is mostly English: the keys,
 * the nesting, the comments. Those are structural and are English by design.
 * The translated text is what is inside the quotes, and that is what is checked.
 */
function stringLiterals(line) {
  const pattern = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  const found = [];
  for (const match of line.matchAll(pattern)) {
    const value = match[1] ?? match[2] ?? match[3];
    if (value !== undefined) found.push(value);
  }
  return found;
}

async function* sourceFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      yield* sourceFiles(path);
    } else if ([".ts", ".tsx", ".mjs"].includes(extname(entry.name))) {
      yield path;
    }
  }
}

const found = [];
let arabicStrings = 0;

for (const directory of DIRECTORIES) {
  for await (const file of sourceFiles(join(ROOT, directory))) {
    const text = await readFile(file, "utf8");

    for (const [index, line] of text.split(/\r?\n/).entries()) {
      const where = `${relative(ROOT, file)}:${index + 1}`;

      // A replacement character is corruption whatever script it replaced.
      if (line.includes("\uFFFD")) found.push([where, "U+FFFD", "replacement character"]);

      for (const value of stringLiterals(line)) {
        if (![...value].some((c) => isArabic(c.codePointAt(0)))) continue;
        arabicStrings += 1;

        for (const character of value) {
          const code = character.codePointAt(0);
          if (code < 0x80 || IGNORED.has(character) || ALLOWED.has(code)) continue;
          if (isArabic(code)) continue;

          const hex = code.toString(16).toUpperCase().padStart(4, "0");
          found.push([where, `U+${hex}`, `stray ${JSON.stringify(character)}`]);
        }

        // Latin words inside a translated string, which needs a human to accept.
        //
        // Placeholders are removed first. `{count}` is not English text that
        // leaked into a translation — it is the key `fill()` looks up, and it
        // has to be spelled the same in both dictionaries or the substitution
        // silently does nothing.
        const prose = value.replace(/\{[A-Za-z][A-Za-z0-9]*\}/g, " ");
        for (const [word] of prose.matchAll(/[A-Za-z][A-Za-z0-9]{1,}/g)) {
          if (!LATIN_ALLOWED.has(word)) {
            found.push([where, JSON.stringify(word), "Latin word in an Arabic string"]);
          }
        }
      }
    }
  }
}

for (const [where, what, why] of found) {
  process.stdout.write(`${where}  ${what}  ${why}\n`);
}
process.stdout.write(
  `\n${arabicStrings} Arabic strings; ${found.length} need a human to look.\n`,
);

if (found.length > 0) {
  process.stdout.write(
    "\nA stray character is corruption: delete it.\n" +
      "A Latin word that belongs there: add it to LATIN_ALLOWED with a reason.\n",
  );
  process.exitCode = 1;
}
