import "server-only";
import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Prisma query logging is deliberately off.
 *
 * When Prisma logs an error it logs the failing statement together with its
 * bound parameters, and the parameters here are member names, phone numbers and
 * attendance dates. A single failed INSERT would put a member's personal data
 * into the application log. This is a privacy-sensitive product that stores
 * people's religious practice, so the log is not an acceptable place for that
 * data to end up. Failures still throw; they simply are not echoed.
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * A transaction handle that is already bound to a single tenant.
 *
 * Every tenant-owned table has Row-Level Security keyed on the `app.tenant_id`
 * setting, so any query run through this handle can only see the one tenant,
 * whether or not the query itself bothers to add a `tenantId` filter. The
 * explicit filters in the query layer are still written, because they make the
 * code readable and they let the database use its indexes; the RLS policies
 * are what make a missing filter a correctness error rather than a data breach.
 */
export type TenantDb = Prisma.TransactionClient;

/**
 * Runs `fn` inside a transaction whose tenant context is `tenantId`.
 *
 * The setting is applied with `set_config(..., true)`, which is transaction
 * local. That detail is what makes this safe in a pooled environment: the
 * session variable is discarded when the transaction ends, so a connection
 * handed back to the pool can never carry one priest's tenant into the next
 * request.
 *
 * If `tenantId` is ever absent or malformed the transaction still opens but the
 * RLS policies deny everything, so the failure mode is an empty result rather
 * than a cross-tenant read.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (db: TenantDb) => Promise<T>,
): Promise<T> {
  if (!tenantId) {
    throw new Error("A tenant context is required to access tenant data.");
  }

  return prisma.$transaction(
    async (transaction) => {
      await transaction.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(transaction);
    },
    // Dashboard queries fan out across a tenant's members, records and audit
    // trail. The interactive-transaction default of 5s is tight for a large
    // parish on slower hardware, so the ceiling is raised deliberately.
    { maxWait: 10_000, timeout: 30_000 },
  );
}

/**
 * Runs `fn` with no tenant context, for identity and authentication work that
 * legitimately happens before a tenant is known: looking up a user by email,
 * resolving which tenants that user belongs to, redeeming an invite code, and
 * recording login throttling.
 *
 * No tenant-owned table is reachable from here. `Member`, `ConfessionRecord`,
 * `AuditLog` and `TenantSettings` are all under RLS, and with no context set
 * the policies match no rows.
 */
export function withoutTenant<T>(fn: (db: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, { maxWait: 10_000, timeout: 30_000 });
}
