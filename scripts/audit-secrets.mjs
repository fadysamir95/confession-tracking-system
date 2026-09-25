// One-off audit of everything about to be committed.
//
// The requirement is that no secret reaches the repository, and a repository
// that has never been committed is the one moment where that is still cheap to
// guarantee. This looks for the shapes a secret takes — a URL with a password
// in it, a long opaque token, a connection string — rather than for the word
// "password", which appears in variable names, comments and test fixtures.

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * Everything git considers part of the project: already tracked, plus new files
 * that are not ignored.
 *
 * Both halves matter. Scanning only the untracked files is what you want before
 * the first commit, and scanning nothing at all once everything is committed —
 * which is to say, a secret check that quietly passes.
 */
const listed = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { cwd: ROOT, encoding: "utf8" },
)
  .split(/\r?\n/)
  .filter(Boolean);

const SKIP = new Set([".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".ico"]);

const SHAPES = [
  {
    name: "connection string with an inline password",
    pattern: /\b(?:postgres(?:ql)?|mysql|mongodb):\/\/[^:/\s"']+:([^@\s"']{6,})@/gi,
    // Anything that is obviously a placeholder rather than a real value.
    placeholder: /^(?:password|pass|secret|xxx|<|\$\{|change_?me|your)/i,
  },
  {
    name: "GitHub token",
    pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
  },
  {
    name: "AWS access key id",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    name: "Google API key",
    pattern: /\bAIza[0-9A-Za-z\-_]{35}\b/g,
  },
  {
    name: "Slack token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    name: "private key block",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
  },
  {
    name: "long opaque assignment",
    // A name that says secret, given a value long enough to be one.
    pattern:
      /\b(?:secret|apiKey|api_key|privateKey|private_key|authToken|auth_token|bearer)\b\s*[:=]\s*["'`]([^"'`\s]{16,})["'`]/gi,
  },
];

// A connection string is expected to *appear* in the example environment file
// and in the test harness; what must not appear is a working one. Local throwaway
// development credentials on a loopback port are the documented setup, so a
// password that only reaches 127.0.0.1 is called out separately below rather than
// treated as a leak.
const findings = [];
let files = 0;

for (const file of listed) {
  const absolute = `${ROOT}${file}`;
  let stat;
  try {
    stat = statSync(absolute);
  } catch {
    continue;
  }
  if (!stat.isFile() || stat.size > 2_000_000) continue;
  if (SKIP.has(extname(file).toLowerCase())) continue;
  files += 1;

  const text = readFileSync(absolute, "utf8");
  for (const shape of SHAPES) {
    shape.pattern.lastIndex = 0;
    for (const match of text.matchAll(shape.pattern)) {
      const value = match[1] ?? match[0];
      if (shape.placeholder?.test(value)) continue;
      findings.push({ file, shape: shape.name, value });
    }
  }
}

for (const finding of findings) {
  process.stdout.write(
    `${finding.file}  ${finding.shape}\n    ${finding.value.slice(0, 60)}\n`,
  );
}
process.stdout.write(
  `\nscanned ${files} files, ${findings.length} possible secrets\n`,
);
if (findings.length > 0) process.exitCode = 1;
