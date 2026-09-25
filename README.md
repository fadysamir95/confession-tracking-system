# Confession Attendance

A private, date-only attendance tracker for follow-up work, built as a
multi-tenant application where each priest's records are isolated from every
other priest's at the database level.

The application records member contact details, attendance dates, follow-up
intervals, and a small amount of explicitly administrative context. It
intentionally has no field for confession content, sins, counseling notes, or
private spiritual notes.

## What is stored

- Member name and optional phone number
- Last recorded attendance date and date-only history
- A system-default or per-member follow-up interval
- Optional administrative note (for scheduling/contact context only)
- Account, session, invitation, throttling, and audit metadata

The dashboard, reminder preview, audit view, and CSV export never request or
include confession details. The optional administrative note is an
operator-controlled field, not a dedicated pastoral-notes field; it is excluded
from CSV export and must not be used for confidential pastoral or spiritual
information.

## Multi-tenancy

The data model is `User → TenantMembership → Tenant`. A user may belong to more
than one tenant in principle, but V1 provisions one priest per tenant and each
workspace has exactly one administrator.

### Where the tenant id comes from

**Nowhere in the request.** There is no tenant parameter on any route, query
string field, or form input. A protected operation resolves the tenant from the
signed-in session on the server, and every database read or write for tenant data
runs inside a transaction that sets that tenant's id as the RLS context.

This is enforced in four independent layers, so a mistake in any one of them
does not expose another parish's records:

1. **Authentication and guards.** `requireTenantContext` and
   `requireCapability` in `src/server/auth.ts` resolve the caller's membership
   from their own session before any handler runs.
2. **Tenant-scoped services.** `src/server/member-service.ts`,
   `src/server/queries.ts`, `src/server/settings.ts`, and `src/server/audit.ts`
   take a `TenantContext` argument. None of them accepts a tenant id, so a
   caller cannot ask a function about a tenant it is not acting in.
3. **Composite foreign keys.** `ConfessionRecord` references
   `Member(tenantId, id)` and `TenantMembership(tenantId, userId)` rather than
   bare ids. A record cannot reference a member or author from another tenant
   even if application code were wrong.
4. **PostgreSQL Row-Level Security.** Every tenant-scoped table has both
   `ENABLE` and `FORCE ROW LEVEL SECURITY`, with a policy comparing `tenantId`
   against `current_setting('app.tenant_id', true)`. See
   `prisma/migrations/20260925120000_enable_row_level_security/`.

### Which tables are under RLS, and why not all of them

Tenant-scoped: `Tenant`, `TenantSettings`, `Member`, `ConfessionRecord`,
`AuditLog`.

Not under RLS: `User`, `Session`, `PasswordResetToken`, `AuthThrottle`,
`TenantMembership`, `InviteCode`.

The unprotected set is a deliberate consequence of the order of operations, not
an oversight. "Which tenants may this user enter?" has to be answered before any
tenant context exists, and the answer is the membership row. Likewise a password
reset token is looked up by digest before anyone is authenticated, and an
invitation code must be redeemable by a visitor who has no session at all. These
tables are protected by server-side predicates derived from a session or a
secret, never from a request parameter.

`Tenant` itself *is* under RLS, which has a consequence worth knowing about: it
cannot be pulled in as a relation on the membership query, because with no
context set the policy matches no rows and the relation resolves to `null`.
Tenant resolution therefore happens in two steps — read the membership, then read
the tenant inside that tenant's own context. `resolveTenantMembership` in
`src/server/auth.ts` does this and explains why.

### The restricted application role

The application must connect as a role that is **not** a superuser and does
**not** carry `BYPASSRLS`. PostgreSQL silently exempts both, and every isolation
guarantee in the application would reduce to convention. This includes the test
suite: a suite connected as `postgres` would pass while proving nothing, which
is why `TEST_DATABASE_URL` must use the same restricted role as production.

Migrations run under a separate owner role via `DIRECT_DATABASE_URL`.
`FORCE ROW LEVEL SECURITY` is what makes the policies apply to that owner too;
without it, PostgreSQL exempts the table owner and migrations or manual queries
would see everything.

New tenants are created without any privileged role: the application generates
the tenant id first, then sets the RLS context to that new id before inserting
the row, so the insert satisfies its own `WITH CHECK`.

### Capabilities and roles

Roles live on `TenantMembership`, not on `User`, so the same person can hold
different roles in different workspaces.

- `PRIEST` — full member management, own settings, export.
- `TENANT_ADMIN` — everything a priest can do, plus delete members, view audit
  history, and manage access.

The mapping is a single `CAPABILITIES` table in `src/lib/constants.ts` with a
`can(role, capability)` helper. Pages check capabilities for presentation, but
the server action re-checks them; hiding a link is never the boundary.

## Languages

The interface is Arabic (right to left) and English (left to right). Arabic is the
default, because that is the product's primary audience.

There is no locale in the URL. A priest who switches language on one page expects
the *next* page to be in that language too, and a URL scheme that carries the
locale would put a `/ar/` or `/en/` on every bookmark and every shared link. The
language is therefore a cookie, read at request time, and `dir` is set on `<html>`
so the first paint is already correct.

Two values are kept, deliberately:

- `confession_locale` — a cookie, the request-time source of truth.
- `User.locale` — a column, the durable preference for a signed-in priest.

They are reconciled at exactly two points — signing in, and using the switcher —
rather than on every request, which would mean a database round trip in the root
layout of every page, including the public sign-in pages that have no user yet.
A first-time visitor with no cookie is given the language their browser asks for.

`src/lib/dictionaries/en.ts` is the structural source of truth and defines the
`Dictionary` type; `ar.ts` is checked against it, so a key that exists in one
language and not the other is a compile error rather than a blank space on a
page. Grammatical number goes through `Intl.PluralRules`, because a hand-written
`count === 1` check is wrong in Arabic, where 2, 3–10 and 11+ each take a
different form.

Dates and numbers render through `ar-EG-u-nu-latn` and `en-GB`. The `-u-nu-latn`
extension keeps Latin digits under Arabic, matching how Egyptian clergy write
dates and phone numbers by hand; a roster mixing Eastern Arabic numerals with
Latin phone numbers is harder to scan, not easier.

Nothing user-facing is written in a service or a validation schema. Services
raise `DomainError(code)` and Zod carries an `@@code:` token in `message`;
`src/app/actions/error-response.ts` is the single place that turns either into a
sentence in the reader's language. That is what lets a refusal be logged as a
compact greppable code while a priest reads a translated explanation.

## Roster import

`/members/import` reads a spreadsheet and adds people in bulk. The spreadsheet is
parsed **in the browser** — the file never reaches the server — using
`DecompressionStream` and `DOMParser`, so the feature added no dependency and
uploaded no roster anywhere. Only two strings per row are submitted: `name` and
`phone`.

- `.xlsx` and `.csv`. The legacy binary `.xls` is not supported and is reported
  as such rather than failing obscurely.
- Columns are matched by name, in English or Arabic, ignoring case, diacritics,
  tatweel, spacing and punctuation. If no header is recognised, the first two
  columns are used positionally and the page says so on screen.
- CSV is decoded as UTF-8, falling back to `windows-1256`, which is what Arabic
  Excel exports usually are.
- Every field goes through the **same** schema the single-member form uses, so
  the import refuses exactly what the form refuses and nothing more. There is no
  second, looser validation path.
- Duplicates are `(name, phone)`, matched the same way the add-member path
  matches them. A row with no phone is never a duplicate, because PostgreSQL
  treats `NULL`s as distinct in a unique index and the single-member path relies
  on that too.
- The whole batch is one transaction and one `MEMBERS_IMPORTED` audit event.
- The result is a report, not a sentence: how many were added, how many matched
  someone already on the roster, and which **line numbers in the priest's own
  file** were refused and why. If more rows were refused than are listed, the
  count still says so.

## Requirements

- Node.js `22.12.0` or newer
- npm
- PostgreSQL 15 or newer (Row-Level Security and `FORCE` semantics)
- A writable filesystem only for build output; the database holds the data

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local environment file from the example:

   ```bash
   cp .env.example .env
   ```

   On Windows PowerShell, use `Copy-Item .env.example .env` instead.

3. Create two PostgreSQL roles and a database. The separation matters:

   ```sql
   -- Runs as a cluster administrator.
   CREATE ROLE confession_owner LOGIN PASSWORD '...' NOSUPERUSER NOBYPASSRLS;
   CREATE ROLE confession_app  LOGIN PASSWORD '...' NOSUPERUSER NOBYPASSRLS;
   CREATE DATABASE confession_dev OWNER confession_owner;
   \c confession_dev
   GRANT ALL ON SCHEMA public TO confession_owner;
   GRANT ALL ON SCHEMA public TO confession_app;
   ```

   Put the two connection strings in `DATABASE_URL` (the `confession_app` role)
   and `DIRECT_DATABASE_URL` (the `confession_owner` role).

4. Create a separate test database with the same two roles, and set
   `TEST_DATABASE_URL` and `TEST_DIRECT_DATABASE_URL` in `.env`.

   The test database must exist only for tests. The suite deletes every row it
   creates, and it will not fall back to a default connection string, so
   pointing it at the wrong database is not something you can do by omission.

5. Apply migrations:

   ```bash
   npm run db:deploy
   ```

6. Seed the first administrator:

   ```bash
   npm run db:seed
   ```

7. Start the development server:

   ```bash
   npm run dev
   ```

Open `http://localhost:3000` and sign in with the seeded administrator.

The seed command is intentionally not part of `npm install` or application
startup. It requires explicit administrator credentials.

## Onboarding additional priests

Registration is invite-only. There is no open public sign-up.

**To create a new, separate workspace** (the usual case — one priest, one
tenant), run the operator CLI on the deployment host:

```bash
npm run invite:new -- --name "St. Mary's Parish"
```

It prints the code once and writes only its SHA-256 digest. The code is not
recoverable afterwards, which is intentional: a leaked database backup yields no
usable invitations.

**To add a second priest to an existing workspace**, a `TENANT_ADMIN` creates the
invitation from within the application. `createInvite` in
`src/server/invites.ts` has no tenant parameter at all — it always mints into
the caller's own tenant, and refuses anyone who is not a tenant administrator.
That is why new-tenant provisioning is a shell command and not an endpoint: if an
in-app request could mint one, every tenant administrator on the platform could
provision unlimited workspaces.

Codes expire after 14 days by default, work a single time, and are consumed
inside a `SELECT … FOR UPDATE` transaction together with the account creation,
so two simultaneous redemptions cannot both succeed and a failed registration
leaves the code unused.

## Password reset

Reset links are single-use, expire after one hour, and are stored only as a
SHA-256 digest. Requesting a reset always returns the same message, whether or
not the address has an account, so the form cannot be used to enumerate users.

Requesting a new link supersedes any earlier one, so a link that leaked from an
earlier request cannot be used after the account holder asks for a new one.
Completing a reset revokes **every** session for that user, on the assumption
that the reset is usually prompted by credentials having been compromised.

In production, missing SMTP configuration is a hard failure rather than a
silent no-op. Reporting a reset as sent when nothing was transmitted would
strand the user with no way in and no error to act on.

## Quality checks

```bash
npm run check
```

That runs linting, type checking, the script checks, the test suite, and the
production build in sequence. Individually:

```bash
npm run lint
npm run typecheck
npm run check:arabic
npm test
npm run build
```

`npm run check:arabic` is not a style rule. A wrong string is still a string, so
a stray English word, a CJK character, or a mangled byte in an Arabic translation
passes the type checker and reaches a priest as a page with one word in the wrong
language on it. The check reads every Arabic string in the tree, reports anything
from a script that has no business being here, and reports any Latin word it has
not been shown and accepted. It is cheap, and it is the only thing standing
between a bad merge and a translated screen.

`npm run check:secrets` looks for the shapes a credential takes — an inline
password in a connection string, a provider token, a private key block — across
everything git considers part of the project. It exists because the requirement
is that no secret ever reaches the repository, and that is worth a check that
runs on every change rather than a promise made once.

**On Windows, stop `npm run dev` before running `npm run check`.** The build
begins with `prisma generate`, which has to replace the Prisma query engine
binary; a running server holds that file open and the replacement fails with
`EPERM: operation not permitted, rename ... query_engine-...dll.node`. The build
is otherwise unaffected, and nothing is wrong with the project — but the error
reads like a corruption and is not one.

`npm test` rebuilds the test database **from the real migration history** via
`prisma migrate reset`, then runs Vitest. It does not touch the development
database. Using `prisma db push` here would be a mistake: it reconciles tables
from `schema.prisma` alone and never applies the migration SQL, so the RLS
policies would be missing and the isolation tests would pass against a database
with no tenant protection at all.

The suite runs as the restricted application role, for the reason described
above, and files run sequentially because they share one database.

Coverage includes date arithmetic and status calculation, member search, filter
and sort, the member and attendance workflow, WhatsApp link building, CSV
escaping, same-origin verification including reverse-proxy cases, login and
reset throttling, session lifecycle and cookie attributes, invite issuance and
atomic redemption, registration and tenant provisioning, password reset, the
authorization boundaries, and the spreadsheet importer — its ZIP and XML layers,
delimiter sniffing, windows-1256 fallback, Arabic header matching, duplicate
handling and tenant scoping.

The isolation suite in `tests/tenant-isolation.test.ts` is the mandatory gate.
It asserts cross-tenant reads, updates, deletes and inserts are all refused;
that a composite foreign key rejects a cross-tenant record; that per-tenant
settings are genuinely separate; and that the database refuses to return any row
at all when no tenant context is set.

### Smoke test against a running server

```bash
npm run smoke -- --base http://127.0.0.1:3000 --email a@b.c --password '…'
```

`scripts/smoke-test.mjs` drives a **running** server over HTTP the way a browser
would, and is not part of `npm run check`. It exists because the claims that
matter most here are claims about a running system, and none of them are visible
to a unit test: that a signed-out request is turned away from every private
route, that each page renders in the reader's language with the right `dir`, that
the language switcher actually changes the next request, that the roster export
answers only to a same-origin POST, and that a member id from another parish is
indistinguishable from one that does not exist.

It signs in as a real account, so point it at a database you are willing to write
to. The only thing it changes is the reader's language, which it switches and
then switches back.

## Date and timezone rules

Attendance dates are stored as validated `YYYY-MM-DD` date-only strings. Due
dates and calendar-day differences use UTC-safe date arithmetic, so
daylight-saving transitions do not change a due-date calculation. The configured
timezone affects only which calendar date is considered **today**.

The default timezone is `Africa/Cairo` and it can be changed under **Settings →
General**. A due date is reached on the due date itself; a member with a
due-soon threshold of `7` is due soon when there are 7 or fewer days remaining.
Members without a date are shown as **No record** and are never treated as
overdue.

Each member can use the system default interval or a custom interval from
1–365 days. Changing the system default affects members using that default;
custom intervals remain unchanged.

## Main routes

- `/login`, `/register`, `/forgot-password`, `/reset-password` — authentication
- `/` — dashboard, attention queues, search/filter/sort, pagination, and fast
  attendance recording
- `/members/new` — minimal member creation form
- `/members/import` — bulk roster import from `.xlsx` or `.csv`
- `/members/[id]/edit` — edit operational member details
- `/settings` — dates, reminder template, security, active sessions, audit
  activity, language, and export controls
- `/settings/archived` — restore and password-confirmed permanent deletion
- `POST /api/export/members` — no-store CSV roster export of active members (not
  a backup)

All pages under the dashboard layout require a valid session and resolve their
tenant from it. The export includes only name, phone, last date, effective
interval, next due date, and status. Administrative notes and attendance history
are excluded. Cells are quoted and formula-like values are prefixed to reduce
spreadsheet formula-injection risk. Exports use an explicit `POST`, are bounded
to 10,000 active-member rows, and are recorded as `DATA_EXPORTED` audit events.

## Security and privacy guidance

- Keep the app behind HTTPS in any non-local deployment. Production cookies use
  the `__Host-confession_session` name, which the browser requires to be
  `Secure`, root-scoped, and free of `Domain`, alongside `HttpOnly` and
  `SameSite=Strict`.
- Passwords are hashed with Argon2id (m=19456, t=2, p=1) using `@node-rs/argon2`.
  A failed login still performs a real verification against a dummy digest, so
  an unknown address and a wrong password take indistinguishable time.
- Prisma query logging is disabled in `src/server/db.ts`. Prisma error logs
  include bound parameters, which would put member names and phone numbers into
  application logs.
- Do not expose `.env`, backups, or the database port. Restrict network access to
  the app and to the database role's own host.
- Use unique administrator credentials and change them through **Settings →
  Security** after first login. Password changes revoke every other session.
- Review active sessions and revoke unfamiliar devices from the same page.
- Keep database backups encrypted, access-controlled, and tested by actually
  restoring one. A backup nobody has restored is a hypothesis, not a backup.
- Avoid placing confession content, sins, counseling details, or private
  religious notes in the optional administrative note or reminder template.
- The default WhatsApp template contains no attendance dates. If date
  placeholders are enabled, remember that the prefilled URL is sent to
  WhatsApp/Meta when opened and may be retained in browser or provider logs.
- Audit entries contain action, timestamp, user, and an internal member ID only;
  permanent-deletion events intentionally remove the member identifier. They do
  not store member names or confidential content.
- The application sends WhatsApp links only after an operator clicks them. It
  never sends a message automatically.

### Cross-origin request checks

The CSV export is a state-changing `POST`, so `src/lib/csrf.ts` verifies that it
came from the same origin. The check deliberately does **not** compare the
`Origin` header against `request.url`: Next.js builds `request.url` from the
hostname the Node process is bound to (and from `x-forwarded-proto` for the
scheme), so behind a reverse proxy a legitimate browser request to
`https://attendance.example.com` would present `request.url` as
`https://localhost:3000` and be rejected.

Instead the check compares hosts:

1. `Sec-Fetch-Site` is used when the browser supplies it, because a page cannot
   forge it and it is unaffected by proxy host rewriting.
2. Otherwise the `Origin`, then the `Referer`, host is compared against the
   `Host` header and, for proxies that rewrite `Host` to the upstream, the first
   value of `X-Forwarded-Host`.
3. Only the host is compared, not the scheme, so TLS termination at a proxy does
   not break the check. This is safe because the session cookie is `Secure`,
   `SameSite=Strict`, and host-bound via the `__Host-` prefix: a cross-site
   caller cannot make the browser attach it, and a same-host caller is already
   authenticated.
4. A request with no browser-supplied origin signal at all is allowed through
   and relies on `SameSite=Strict`; this keeps the endpoint usable from an
   operator's authenticated CLI. A request that carries an `Origin` or `Referer`
   but no host information is rejected.

When deploying behind a reverse proxy, forward the original `Host` (or
`X-Forwarded-Host`). Next.js applies its own `Origin`/`X-Forwarded-Host` check to
Server Action requests, so a proxy that rewrites the host inconsistently will
make forms and actions fail with an "Invalid Server Actions request" error.

## Deployment

A typical process:

1. Provision managed PostgreSQL. Create the two roles described above, and
   confirm the application role has neither `SUPERUSER` nor `BYPASSRLS`.
2. Set `DATABASE_URL`, `DIRECT_DATABASE_URL`, `APP_URL`, and the SMTP values in
   the deployment secret store. `APP_URL` must be the public HTTPS origin, since
   reset links are built from it.
3. Install dependencies and run `npm run db:deploy`.
4. Run `npm run db:seed` once with a strong, unique password, or provision the
   first administrator through a controlled internal process.
5. Build with `npm run build`. The build prepares a standalone bundle, removes
   any copied `.env`, and copies static assets; supply secrets only at runtime.
   Run `npm run start` for the regular Next server or `npm run start:standalone`
   for the prepared bundle.
6. Terminate TLS at a trusted reverse proxy and restrict network access to the
   app.
7. Configure encrypted backups with a defined retention period for archived
   records and audit logs, and monitor database health.
8. Issue each new priest an invitation with `npm run invite:new -- --name …`.

The application holds no private data in memory beyond the current request, and
no tenant data is cached between requests, so horizontal scaling needs no
additional coordination. Sessions live in the database, not in process memory,
so any instance can serve any request.

## Known limitations

- Cross-tenant access returns 403/404 without revealing whether the other tenant
  exists. A cross-tenant *read* is indistinguishable from a missing row, because
  the database returns nothing rather than an error; a cross-tenant *mutation*
  is likewise refused. Timing differences between those cases have not been
  measured.
- A membership revoked mid-request does not abort the request already in flight.
  Revocation takes effect from the next request onward.
- Dashboard, archived-member, and audit-history queries are not paginated at the
  data-access layer, so they load the full matching set into memory. This is
  comfortable for a parish-sized roster but will slow as a roster grows; the
  export endpoint is the only query with an enforced 10,000-row bound.
- Archived members and their attendance history are retained until an
  administrator permanently deletes them. There is no automatic retention purge
  or scheduled cleanup job; deletion is entirely operator-driven.
- Export is bounded by size, not by rate. There is no dedicated export rate
  limiter, though the same-origin check and capability requirement apply.
- Bilingual Arabic/English UI is not implemented. The schema stores a locale per
  user and the RTL work is deliberately deferred until the isolation suite is
  green.
- Visual review has been performed against server-rendered HTML, response
  headers, and RSC payloads only; no desktop or mobile browser was available for
  interactive and responsive checks.

## Privacy review before launch

Before using real records, verify that:

- the deployment is private and HTTPS-only;
- the database application role is confirmed to lack `SUPERUSER` and
  `BYPASSRLS`;
- a restore from encrypted backup has actually been tested;
- the optional administrative note is used only for non-sensitive operational
  context;
- exported CSV files are handled and deleted according to local policy;
- timezone and follow-up thresholds match the organization's operating rules;
  and
- access is limited to people who are authorized to see attendance dates.
