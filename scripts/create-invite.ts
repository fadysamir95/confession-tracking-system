/**
 * Operator CLI for minting platform invitations.
 *
 * A new tenant can only be created by someone who already controls the server,
 * which is why this is a command rather than a page. An in-app endpoint for
 * this would be an unauthenticated way to provision workspaces for strangers,
 * and even an authenticated one would hand a platform capability to every tenant
 * administrator. Running it from the deployment host keeps the blast radius at
 * "someone with shell access", which is the trust boundary that already exists.
 *
 * Usage:
 *   npm run invite:new -- --name "St. Mary's Parish"
 *   npm run invite:new -- --name "St. Mary's Parish" --days 30
 *   npm run invite:new -- --tenant <tenantId>   # join an existing tenant
 *
 * The code is printed once and is not recoverable afterwards; only its SHA-256
 * digest is stored.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { generateCode, hashCode } from "@/lib/invite-code";
import { USER_ROLES } from "@/lib/constants";

function parseArgs(argv: string[]) {
  const options: { name?: string; tenantId?: string; days: number; email?: string } = {
    days: 14,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];

    if (flag === "--name") {
      options.name = value;
      index += 1;
    } else if (flag === "--tenant") {
      options.tenantId = value;
      index += 1;
    } else if (flag === "--email") {
      options.email = value;
      index += 1;
    } else if (flag === "--days") {
      const days = Number(value);
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        throw new Error("--days must be a whole number between 1 and 365.");
      }
      options.days = days;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }

  return options;
}

// Note there is no slug logic here. This command stores the *name* the operator
// typed; the slug is derived at redemption time, inside the transaction that
// actually creates the tenant. Generating it now would open a window in which
// two codes minted for identically named parishes would race for the same slug,
// and the second registration would fail at the worst possible moment.

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.tenantId && !options.name?.trim()) {
    throw new Error(
      "Pass --name for a new tenant, or --tenant <tenantId> to add someone to an existing one.",
    );
  }

  const prisma = new PrismaClient();
  try {
    const code = generateCode();
    const expiresAt = new Date(Date.now() + options.days * 24 * 60 * 60 * 1_000);

    await prisma.inviteCode.create({
      data: {
        codeHash: hashCode(code),
        // A code that provisions a tenant always creates that tenant's first
        // administrator. Allowing a priest to be the sole owner of a workspace
        // with no way to delegate access would be a dead end.
        role: options.tenantId ? USER_ROLES.PRIEST : USER_ROLES.TENANT_ADMIN,
        tenantId: options.tenantId ?? null,
        tenantName: options.tenantId ? null : options.name!.trim(),
        email: options.email?.toLowerCase() ?? null,
        maxUses: 1,
        expiresAt,
        // Platform invitations have no in-app creator, so this nullable column
        // records the shell operator rather than pretending a user did it.
        createdById: null,
      },
    });

    const target = options.tenantId
      ? `the existing tenant ${options.tenantId}`
      : `a new workspace named "${options.name!.trim()}"`;

    process.stdout.write(
      [
        "",
        `  Invitation created for ${target}.`,
        "",
        `  Code:      ${code}`,
        `  Expires:   ${expiresAt.toISOString()}`,
        "",
        `  Register:  ${process.env.APP_URL ?? "https://your-app.example"}/register?code=${code}`,
        "",
        "  This code is shown once and is not recoverable. Only its digest is stored.",
        "",
      ].join("\n"),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
