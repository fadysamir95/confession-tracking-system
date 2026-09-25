-- ===========================================================================
-- Row-Level Security: the database-level tenant boundary
-- ===========================================================================
-- The application resolves the tenant from the authenticated session, sets it
-- per transaction with:
--
--     SELECT set_config('app.tenant_id', $1, true);
--
-- and then queries. The third argument (true) makes the setting transaction
-- local, which is what makes this safe behind a connection pool: a pooled
-- connection can never leak one request's tenant into the next.
--
-- `current_setting('app.tenant_id', true)` returns NULL when the setting has
-- never been set. Comparing a tenant_id column against NULL yields NULL, which
-- is not TRUE, so the policies below DENY every row rather than allowing
-- everything. An unconfigured database is therefore closed, not open.
--
-- FORCE ROW LEVEL SECURITY is essential. Without it, PostgreSQL exempts a
-- table's owner from its own policies. If the application ever connects as the
-- owner, omitting FORCE would silently disable this entire file.

-- ---------------------------------------------------------------------------
-- Tenant-scoped tables
-- ---------------------------------------------------------------------------
ALTER TABLE "Tenant"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant"        FORCE  ROW LEVEL SECURITY;
ALTER TABLE "TenantSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantSettings" FORCE  ROW LEVEL SECURITY;
ALTER TABLE "Member"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Member"         FORCE  ROW LEVEL SECURITY;
ALTER TABLE "ConfessionRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConfessionRecord" FORCE  ROW LEVEL SECURITY;
ALTER TABLE "AuditLog"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog"       FORCE  ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
-- Tenant: the tenant row itself. There is no separate "id" column check
-- written twice; the identifier is the row's primary key.
CREATE POLICY tenant_isolation ON "Tenant"
  USING      (id = current_setting('app.tenant_id', true))
  WITH CHECK (id = current_setting('app.tenant_id', true));

-- The three data tables all carry a tenantId column, so they share one shape.
-- The single policy per table is FOR ALL, which covers SELECT, INSERT, UPDATE
-- and DELETE. WITH CHECK is what stops a write from moving a row to another
-- tenant: an UPDATE that rewrites tenant_id to somebody else's value is
-- rejected even if the app layer gets it wrong.
-- Column names are quoted because Postgres folds unquoted identifiers to lower
-- case, and these columns are camelCase. An unquoted `tenantId` would resolve
-- to `tenantid`, which does not exist.
CREATE POLICY tenant_isolation ON "TenantSettings"
  USING      ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON "Member"
  USING      ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON "ConfessionRecord"
  USING      ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON "AuditLog"
  USING      ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- ---------------------------------------------------------------------------
-- Tables deliberately NOT under RLS, and why
-- ---------------------------------------------------------------------------
-- User, Session, PasswordResetToken, AuthThrottle
--   Identity and authentication state. These must be readable before a tenant
--   is known, because resolving which tenant a user belongs to is the step that
--   produces app.tenant_id in the first place. They are reached only through
--   server-side code keyed on the authenticated user id or an opaque hashed
--   token, never on a client-supplied identifier.
--
-- TenantMembership
--   Same reason: "which tenants may this user enter?" is the query that runs
--   before any tenant context exists. It is always filtered by a userId taken
--   from the session, so it can only ever return the caller's own rows. Making
--   it RLS-protected would be circular, not safer.
--
-- InviteCode
--   Validated during onboarding, before a session exists. Codes are 256-bit
--   random values and are stored only as a SHA-256 digest, so they are not
--   enumerable, and redemption is a single atomic conditional update.

-- ---------------------------------------------------------------------------
-- Tenant provisioning
-- ---------------------------------------------------------------------------
-- A brand new tenant has to be inserted before any tenant context exists, which
-- looks like a contradiction: WITH CHECK above demands that a Tenant row's id
-- equal app.tenant_id.
--
-- It is not a contradiction, and it needs no privileged escape hatch. The
-- application generates the tenant id first, opens a transaction, and sets the
-- context to that id:
--
--     BEGIN;
--     SELECT set_config('app.tenant_id', $new_tenant_id, true);
--     INSERT INTO "Tenant" (...) VALUES ($new_tenant_id, ...);   -- policy admits it
--     INSERT INTO "TenantSettings" ...;                            -- policy admits it
--     INSERT INTO "TenantMembership" ...;                         -- no RLS by design
--     COMMIT;
--
-- Each statement therefore sees exactly one tenant, and it is the new one.
-- Because all three inserts share a transaction, a tenant, its settings and its
-- first membership are created atomically, so a half-provisioned tenant can
-- never be observed.
--
-- Note what this deliberately does NOT do: there is no SECURITY DEFINER
-- function, no BYPASSRLS role, and no "allow all inserts" policy branch. An
-- earlier version of this file used a SECURITY DEFINER function and it does not
-- work here, for a reason worth recording. SECURITY DEFINER executes with the
-- privileges of the function owner, who is the table owner, and FORCE ROW
-- LEVEL SECURITY subjects the owner to these very policies. The insert is
-- rejected by the policy that is supposed to be protecting it. Widening the
-- escape with a BYPASSRLS role would fix it while adding a second privileged
-- role to provision, audit and keep out of application connection strings.
--
-- Requiring the caller to set the context it wants is a smaller and safer
-- concession: the caller can only ever address the one tenant it just named,
-- and it still cannot read a row belonging to anybody else.

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
-- Grant policies apply to any role, so the statements below are only about
-- table privileges. The application role is conventionally named
-- confession_app; the block is a no-op when that role is absent, which lets
-- this migration run against a differently named role. An operator who names
-- their application role something else must grant the same privileges by hand
-- (see README, "Deploying").
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'confession_app') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO confession_app';

    -- Tenant-owned data. The application may read and write rows; RLS decides
    -- which rows those are. INSERT is granted on Tenant because onboarding
    -- provisions a new tenant inside the tenant's own context, as described
    -- above. It can only ever create a tenant that is empty and isolated.
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "Tenant" TO confession_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "TenantSettings" TO confession_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "Member" TO confession_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "ConfessionRecord" TO confession_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "AuditLog" TO confession_app';

    -- Identity and authentication state. No RLS here by design; access is
    -- controlled by which queries the application is able to build.
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "User" TO confession_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "Session" TO confession_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "PasswordResetToken" TO confession_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "AuthThrottle" TO confession_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "InviteCode" TO confession_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "TenantMembership" TO confession_app';
  END IF;
END;
$$;
