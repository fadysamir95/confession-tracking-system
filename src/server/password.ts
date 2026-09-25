import { hash, verify } from "@node-rs/argon2";

/**
 * Password hashing uses Argon2id via the libargon2 bindings rather than a
 * hand-rolled scheme or a pure-JS implementation. The parameters are the
 * OWASP recommended baseline: 19 MiB of memory, two passes, one lane.
 *
 * The cost parameters live in one place because they must never be applied
 * inconsistently. Note that the memory cost is why hashing is deliberately
 * kept out of hot paths: at 19 MiB per hash it is a meaningful cost to pay on
 * every request, so it happens exactly once per login or password change and
 * never speculatively.
 *
 * There is deliberately no `server-only` guard on this module. It holds no
 * secret and no server state — just a hash and a verify — and `prisma/seed.ts`
 * needs it to hash the bootstrap password. The guard would only make the module
 * unimportable from the seed and the operator CLI, so it would protect nothing
 * while blocking legitimate uses. The modules that *do* hold server-only state,
 * such as `db.ts` and `auth.ts`, keep theirs.
 */
const ARGON2_OPTIONS = {
  algorithm: 2, // Argon2id
  memoryCost: 19_456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  passwordHash: string,
  candidate: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, candidate, ARGON2_OPTIONS);
  } catch {
    // A malformed stored hash is an integrity problem, not a failed login. It
    // must never be distinguishable from "wrong password" to the caller, so it
    // is reported the same way and simply does not authenticate.
    return false;
  }
}
