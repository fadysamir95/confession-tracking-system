import { createHash, randomBytes } from "node:crypto";

/**
 * Invitation code generation and validation.
 *
 * This lives apart from the server-only invite service on purpose. The
 * application needs it when a priest redeems a code, and the operator CLI needs
 * it when an administrator mints one; both must produce byte-identical codes
 * and digests, and a duplicated alphabet or length in two files is exactly the
 * kind of drift that produces "invalid code" reports weeks later.
 *
 * Nothing here touches the database, so it stays importable from both a Next
 * server module and a standalone script.
 *
 * Invitation codes are the only way a new tenant or a new priest enters the
 * platform. There is no open sign-up: the application holds records of people's
 * religious practice, and an unauthenticated self-service form would be both an
 * open door and an abuse target.
 */

// Crockford-style alphabet: no I, L, O or U, so a code read aloud or retyped by
// a priest cannot be mistranscribed into a different code.
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 24 characters at 5 bits each: 120 bits of entropy. */
export const CODE_LENGTH = 24;

export function generateCode(): string {
  // One random byte per character, masked to its low five bits. 32 divides 256
  // exactly, so this samples the alphabet uniformly with no modulo bias and no
  // rejection loop.
  const bytes = randomBytes(CODE_LENGTH);
  let code = "";
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[bytes[index]! & 31];
  }
  return code;
}

/** Accepts a code in any case and tolerates the spaces people paste in. */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function isWellFormedCode(code: string): boolean {
  return normalizeCode(code).length === CODE_LENGTH;
}

/**
 * Digests a code for storage.
 *
 * Only the digest is persisted, so a leaked database backup yields no usable
 * invitations. A plain SHA-256 is the right choice here: a code is 120 bits of
 * CSPRNG output rather than a user-chosen secret, so there is nothing to
 * brute force and a memory-hard function would only slow down redemption.
 */
export function hashCode(code: string): string {
  return createHash("sha256").update(normalizeCode(code)).digest("hex");
}
