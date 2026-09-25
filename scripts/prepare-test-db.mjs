/**
 * Prepares the PostgreSQL database used by the test suite.
 *
 * The test database is rebuilt from the real migration history rather than
 * pushed from the schema, and that distinction is essential. `prisma db push`
 * reconciles tables from schema.prisma alone, so it would silently skip the RLS
 * policies in the migration that are the entire subject of the isolation tests.
 * The suite would then pass against a database with no tenant protection at all,
 * reporting success while testing nothing.
 *
 * The migration is applied with the schema-owner role, because dropping and
 * recreating the schema is a DDL privilege the application role deliberately
 * does not have. The tests themselves still connect as the restricted
 * application role.
 *
 * Connection details come from .env and are never hard-coded here.
 */
import { spawnSync } from "node:child_process";
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: join(projectRoot, ".env") });

const directUrl = process.env.TEST_DIRECT_DATABASE_URL ?? process.env.DIRECT_DATABASE_URL;

if (!directUrl) {
  process.stderr.write(
    "TEST_DIRECT_DATABASE_URL or DIRECT_DATABASE_URL must be set in .env.\n",
  );
  process.exit(1);
}

if (!process.env.TEST_DATABASE_URL) {
  process.stderr.write("TEST_DATABASE_URL must be set in .env.\n");
  process.exit(1);
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  npx,
  ["prisma", "migrate", "reset", "--force", "--skip-seed", "--skip-generate"],
  {
    cwd: projectRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      DATABASE_URL: directUrl,
      DIRECT_DATABASE_URL: directUrl,
    },
  },
);

if (result.error) {
  process.stderr.write(`${result.error.message}\n`);
  process.exit(1);
}

process.exit(result.status ?? 1);
