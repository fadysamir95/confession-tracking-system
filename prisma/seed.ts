import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { defaultSettings, USER_ROLES } from "../src/lib/constants";
import { resolveLocale } from "../src/lib/i18n";
import { defaultWhatsappTemplate } from "../src/lib/whatsapp";

const prisma = new PrismaClient();

/**
 * The interface language the seeded administrator starts in.
 *
 * Defaults to Arabic because that is the product's primary audience, and an
 * operator seeding a Coptic parish should not have to set a variable to avoid
 * handing their first administrator an English reminder template.
 */
const seedLocale = resolveLocale(process.env.SEED_LOCALE);

/**
 * Direct, unmediated database access, deliberately bypassing the application's
 * tenant context.
 *
 * This is the one place that is allowed to write across tenants, and it does so
 * only to create the very first tenant and administrator before any user
 * exists. Once a platform is running, onboarding goes through the invitation
 * flow, which is tenant-scoped like everything else.
 */
function requireEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required to seed the first administrator.`);
  }
  return value;
}

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "tenant"}-${randomBytes(3).toString("hex")}`;
}

async function main() {
  const name = requireEnvironmentValue("ADMIN_NAME");
  const email = requireEnvironmentValue("ADMIN_EMAIL").toLowerCase();
  const password = requireEnvironmentValue("ADMIN_PASSWORD");
  const tenantName = process.env.TENANT_NAME?.trim() || `${name}'s parish`;

  if (password.length < 12) {
    throw new Error("ADMIN_PASSWORD must contain at least 12 characters.");
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  const resetRequested = process.env.SEED_RESET === "true";

  if (existing && !resetRequested) {
    process.stdout.write(
      `Administrator ${email} already exists; password and access were not changed. ` +
        "Set SEED_RESET=true only for an intentional incident reset.\n",
    );
    return;
  }

  // Argon2id, matching the application's own hashing. A bcrypt cost of 12 is
  // still orders of magnitude cheaper to attack than this, and the parameters
  // must match or the application cannot verify the hash it finds here.
  const { hashPassword } = await import("../src/server/password");
  const passwordHash = await hashPassword(password);
  const tenantId = randomBytes(16).toString("hex");

  await prisma.$transaction(async (transaction) => {
    // The RLS policies admit a row only for the tenant named in the context, so
    // the context is set to the id about to be created. This is the same
    // technique the signup flow uses; see the RLS migration for the reasoning.
    await transaction.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

    if (existing) {
      await transaction.user.update({
        where: { id: existing.id },
        data: { name, passwordHash, isActive: true, locale: seedLocale },
      });
      await transaction.session.deleteMany({ where: { userId: existing.id } });
    } else {
      await transaction.user.create({
        data: {
          id: randomBytes(12).toString("hex"),
          name,
          email,
          passwordHash,
          locale: seedLocale,
        },
      });
    }

    const user = await transaction.user.findUniqueOrThrow({ where: { email } });

    await transaction.tenant.create({
      data: { id: tenantId, name: tenantName, slug: generateSlug(tenantName) },
    });
    await transaction.tenantSettings.create({
      data: { tenantId, ...defaultSettings(defaultWhatsappTemplate(seedLocale)) },
    });
    await transaction.tenantMembership.create({
      data: { tenantId, userId: user.id, role: USER_ROLES.TENANT_ADMIN },
    });
    await transaction.auditLog.create({
      data: { tenantId, action: "TENANT_CREATED", userId: user.id },
    });
  });

  process.stdout.write(
    `Seeded tenant "${tenantName}" with administrator ${email}.\n` +
      "Remove ADMIN_PASSWORD from the environment once the account exists.\n",
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
