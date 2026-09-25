import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { defaultSettings, USER_ROLES, type UserRole } from "@/lib/constants";
import { defaultWhatsappTemplate } from "@/lib/whatsapp";
import type { TenantContext } from "@/server/auth";

/**
 * Test fixtures for the multi-tenant world.
 *
 * Every helper here provisions through the same path the application uses, so
 * the tests exercise real provisioning rather than a privileged shortcut that
 * production code could never take.
 */

function id(): string {
  return randomBytes(12).toString("hex");
}

/** Creates a tenant, its settings row, and its first administrator. */
export async function seedTenant(
  prisma: PrismaClient,
  options: { name: string; role?: UserRole },
): Promise<TenantContext> {
  const tenantId = id();
  const userId = id();

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    await tx.tenant.create({
      data: { id: tenantId, name: options.name, slug: `${tenantId}-slug` },
    });
    await tx.tenantSettings.create({
      // The Arabic default, matching a brand-new tenant created through the
      // registration flow. A test that asserts on reminder copy is asserting on
      // the same string production would have written.
      data: { tenantId, ...defaultSettings(defaultWhatsappTemplate("ar")) },
    });
    await tx.user.create({
      data: {
        id: userId,
        name: `${options.name} admin`,
        email: `${tenantId}@example.com`,
        // A syntactically valid Argon2id digest of a value no test supplies.
        passwordHash:
          "$argon2id$v=19$m=19456,t=2,p=1$+u4oJlohM4R7Rre0Vh/OvA$iBpBTFF7s8yvuVyqqfDSp/v2snB+ZZbWqVYDVPMMutE",
      },
    });
    await tx.tenantMembership.create({
      data: { tenantId, userId, role: options.role ?? USER_ROLES.TENANT_ADMIN },
    });
  });
  createdTenants.add(tenantId);

  return {
    user: { id: userId, name: `${options.name} admin`, email: `${tenantId}@example.com`, locale: "ar" },
    membership: { id: id(), role: options.role ?? USER_ROLES.TENANT_ADMIN },
    tenant: { id: tenantId, name: options.name, slug: `${tenantId}-slug` },
    sessionId: id(),
  };
}

/**
 * Adds a second member to an existing tenant and returns a context for them.
 * This is the shape used to prove that a lower-privileged member is confined
 * within the same tenant.
 */
export async function addMemberToTenant(
  prisma: PrismaClient,
  tenant: TenantContext,
  options: { name: string; role?: UserRole },
): Promise<TenantContext> {
  const userId = id();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenant.tenant.id}, true)`;
    await tx.user.create({
      data: {
        id: userId,
        name: options.name,
        email: `${userId}@example.com`,
        passwordHash:
          "$argon2id$v=19$m=19456,t=2,p=1$+u4oJlohM4R7Rre0Vh/OvA$iBpBTFF7s8yvuVyqqfDSp/v2snB+ZZbWqVYDVPMMutE",
      },
    });
    await tx.tenantMembership.create({
      data: {
        tenantId: tenant.tenant.id,
        userId,
        role: options.role ?? USER_ROLES.PRIEST,
      },
    });
  });

  return {
    user: { id: userId, name: options.name, email: `${userId}@example.com`, locale: "ar" },
    membership: { id: id(), role: options.role ?? USER_ROLES.PRIEST },
    tenant: tenant.tenant,
    sessionId: id(),
  };
}

/**
 * Tenants created during a test run.
 *
 * Teardown needs to reach every row, but Row-Level Security is enforced with
 * FORCE, so no role short of a BYPASSRLS maintenance account can delete
 * globally. Rather than introduce a role that could defeat the very boundary
 * the suite exists to prove, the harness tracks the tenants it created and
 * cleans each one inside its own context. A stricter teardown than production
 * is the right trade here.
 */
const createdTenants = new Set<string>();

/**
 * Registers a tenant created by application code rather than by a fixture.
 *
 * The registration flow provisions its own tenant inside a transaction, so the
 * harness never sees the id being created. A test that exercises onboarding
 * must hand the id back here, or the tenant survives teardown and the next test
 * file starts from a dirty database.
 */
export function trackTenant(tenantId: string): void {
  createdTenants.add(tenantId);
}

export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  // Tables without RLS clear in one statement, whatever the context.
  await prisma.passwordResetToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.authThrottle.deleteMany();
  await prisma.inviteCode.deleteMany();

  for (const tenantId of createdTenants) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      // Children first, because the composite foreign keys are enforced.
      await tx.auditLog.deleteMany();
      await tx.confessionRecord.deleteMany();
      await tx.member.deleteMany();
      await tx.tenantSettings.deleteMany();
      await tx.tenantMembership.deleteMany();
      await tx.tenant.deleteMany();
    });
  }
  createdTenants.clear();

  await prisma.user.deleteMany();
}
