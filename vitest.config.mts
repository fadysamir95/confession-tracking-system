import "dotenv/config";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Tests run against a dedicated PostgreSQL database as the same restricted role
 * the application uses.
 *
 * That detail is the point. Row-Level Security is silently ignored by a
 * superuser and by any role carrying BYPASSRLS, so a suite connected as
 * `postgres` would happily pass while proving nothing: every tenant would see
 * every row. Connecting as the application role is what makes the isolation
 * assertions meaningful, and it is why the same restricted role is used here as
 * in production.
 *
 * Override with TEST_DATABASE_URL if the test database lives elsewhere.
 *
 * There is deliberately no fallback. The test files clear the tables they use,
 * so a suite that guessed its way to a connection string could empty a real
 * database that happened to be listening on the expected port. Requiring the
 * variable means the person running the suite chose the database, and the
 * README's warning about running `npm run db:seed` is about a database the
 * developer knows they are pointing at.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is not set. The test suite deletes every row it creates, " +
      "so it must be told which database to use rather than guessing one. Copy " +
      ".env.example to .env and set TEST_DATABASE_URL to a database that exists " +
      "only for tests.",
  );
}
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Every database-backed test file shares one PostgreSQL database and clears
    // the tables in its own beforeAll/afterAll hooks. Running files in parallel
    // would let one file's teardown delete another file's fixtures mid-test, so
    // files run sequentially.
    fileParallelism: false,
    env: {
      DATABASE_URL: testDatabaseUrl,
      DIRECT_DATABASE_URL: testDatabaseUrl,
      NODE_ENV: "test",
      // Keep reset emails out of the test output. The mailer refuses to send
      // without this in production, but tests run with NODE_ENV=test and would
      // otherwise print reset links into the console.
      APP_URL: "http://localhost:3000",
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./tests/server-only.ts", import.meta.url),
      ),
    },
  },
});
