-- =============================================================================
-- 0001 RLS foundation (hand-written; see docs/adr/0007-database-roles-and-rls.md)
--
-- Roles (created by `pnpm db:bootstrap`, never by migrations):
--   dxo_migrator  schema owner; runs migrations only
--   dxo_app       runtime web/worker role; NOBYPASSRLS; per-transaction tenant context
--   dxo_auth      Better Auth identity store; no access to venture data
--   dxo_definer   NOLOGIN BYPASSRLS; owns SECURITY DEFINER functions only (policies do
--                 not apply to it, so its table grants are kept to the minimum needed)
--
-- Tenant context is set per transaction by the application:
--   app.actor_type  'user' | 'service'
--   app.user_id     uuid (user actors)
--   app.service_id  text (service actors, e.g. 'worker:email')
--   app.venture_id  uuid (active venture; empty when none)
-- Missing or empty context fails closed: every venture policy evaluates to false.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Schemas and baseline privileges
-- ---------------------------------------------------------------------------
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO dxo_app, dxo_auth, dxo_definer;

CREATE SCHEMA app;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO dxo_app, dxo_auth, dxo_definer;
-- Required so function ownership can be transferred to dxo_definer.
GRANT CREATE ON SCHEMA app TO dxo_definer;

-- ---------------------------------------------------------------------------
-- Context accessors (SECURITY INVOKER; read transaction-local settings)
-- ---------------------------------------------------------------------------
CREATE FUNCTION app.current_actor_type() RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT coalesce(nullif(current_setting('app.actor_type', true), ''), 'none') $$;

CREATE FUNCTION app.current_user_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT CASE WHEN app.current_actor_type() = 'user'
                    THEN nullif(current_setting('app.user_id', true), '')::uuid END $$;

CREATE FUNCTION app.current_service_id() RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT CASE WHEN app.current_actor_type() = 'service'
                    THEN nullif(current_setting('app.service_id', true), '') END $$;

CREATE FUNCTION app.current_venture_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT nullif(current_setting('app.venture_id', true), '')::uuid $$;

-- ---------------------------------------------------------------------------
-- Membership checks (SECURITY DEFINER, owned by dxo_definer which bypasses RLS,
-- so policies on venture_memberships can call them without recursion).
-- ---------------------------------------------------------------------------
CREATE FUNCTION app.venture_role(p_venture_id uuid) RETURNS venture_role
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
    SELECT m.role
    FROM public.venture_memberships m
    WHERE m.venture_id = p_venture_id
      AND m.user_id = app.current_user_id()
      AND m.status = 'active'
  $$;

CREATE FUNCTION app.has_venture_access(p_venture_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
    SELECT CASE app.current_actor_type()
      WHEN 'user' THEN EXISTS (
        SELECT 1 FROM public.venture_memberships m
        WHERE m.venture_id = p_venture_id
          AND m.user_id = app.current_user_id()
          AND m.status = 'active')
      -- Background jobs carry an explicit service identity and a single venture (spec §15).
      WHEN 'service' THEN app.current_service_id() IS NOT NULL
                          AND p_venture_id = app.current_venture_id()
      ELSE false
    END
  $$;

-- Argument-free form so policies can evaluate it once per statement via (SELECT ...).
CREATE FUNCTION app.has_current_venture_access() RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT coalesce(app.has_venture_access(app.current_venture_id()), false) $$;

-- True when the row belongs to the active venture context and the actor may access it.
CREATE FUNCTION app.in_venture_context(p_venture_id uuid) RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT p_venture_id = app.current_venture_id() AND app.has_current_venture_access() $$;

CREATE FUNCTION app.has_venture_role(p_venture_id uuid, p_roles venture_role[]) RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT coalesce(app.venture_role(p_venture_id) = ANY (p_roles), false) $$;

CREATE FUNCTION app.shares_venture_with(p_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
    SELECT EXISTS (
      SELECT 1
      FROM public.venture_memberships mine
      JOIN public.venture_memberships theirs ON theirs.venture_id = mine.venture_id
      WHERE mine.user_id = app.current_user_id()
        AND mine.status = 'active'
        AND theirs.user_id = p_user_id
        AND theirs.status <> 'removed')
  $$;

-- ---------------------------------------------------------------------------
-- Venture creation: inserts the venture and its Owner membership atomically.
-- The only path for creating ventures; dxo_app has no INSERT on ventures.
-- ---------------------------------------------------------------------------
CREATE FUNCTION app.create_venture(
  p_name text,
  p_legal_name text DEFAULT NULL,
  p_company_number text DEFAULT NULL,
  p_country_code char(2) DEFAULT 'GB',
  p_reporting_currency char(3) DEFAULT 'GBP',
  p_timezone text DEFAULT 'Europe/London'
) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
  DECLARE
    v_user_id uuid := app.current_user_id();
    v_venture_id uuid;
  BEGIN
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'create_venture requires an authenticated user context'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF coalesce(btrim(p_name), '') = '' THEN
      RAISE EXCEPTION 'venture name is required' USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.ventures (name, legal_name, company_number, country_code,
                                 reporting_currency, timezone, created_by)
    VALUES (btrim(p_name), p_legal_name, p_company_number, p_country_code,
            p_reporting_currency, p_timezone, v_user_id)
    RETURNING id INTO v_venture_id;

    INSERT INTO public.venture_memberships (venture_id, user_id, role)
    VALUES (v_venture_id, v_user_id, 'owner');

    RETURN v_venture_id;
  END
  $$;

-- ---------------------------------------------------------------------------
-- Standard tenant policies for venture-owned tables (used by P1+ migrations).
-- Creates ENABLE/FORCE RLS plus one policy per command for dxo_app.
-- Grants remain explicit in each migration.
-- ---------------------------------------------------------------------------
CREATE FUNCTION app.apply_tenant_policies(p_table regclass) RETURNS void
  LANGUAGE plpgsql
  AS $$
  DECLARE
    v_name text := (SELECT relname FROM pg_class WHERE oid = p_table);
    v_pred text := 'venture_id = (SELECT app.current_venture_id()) AND (SELECT app.has_current_venture_access())';
  BEGIN
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_table);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', p_table);
    EXECUTE format('CREATE POLICY %I ON %s FOR SELECT TO dxo_app USING (%s)', v_name || '_tenant_select', p_table, v_pred);
    EXECUTE format('CREATE POLICY %I ON %s FOR INSERT TO dxo_app WITH CHECK (%s)', v_name || '_tenant_insert', p_table, v_pred);
    EXECUTE format('CREATE POLICY %I ON %s FOR UPDATE TO dxo_app USING (%s) WITH CHECK (%s)', v_name || '_tenant_update', p_table, v_pred, v_pred);
    EXECUTE format('CREATE POLICY %I ON %s FOR DELETE TO dxo_app USING (%s)', v_name || '_tenant_delete', p_table, v_pred);
  END
  $$;
REVOKE ALL ON FUNCTION app.apply_tenant_policies(regclass) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Generic triggers
-- ---------------------------------------------------------------------------
CREATE FUNCTION app.touch_updated_at() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- Any role/status change bumps the version, invalidating cached authorization.
CREATE FUNCTION app.bump_membership_version() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.version := OLD.version + 1;
    ELSE
      NEW.version := OLD.version;
    END IF;
    RETURN NEW;
  END
  $$;

CREATE FUNCTION app.reject_audit_mutation() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = 'insufficient_privilege';
  END
  $$;

CREATE TRIGGER users_touch_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER ventures_touch_updated_at BEFORE UPDATE ON ventures
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER venture_memberships_touch_updated_at BEFORE UPDATE ON venture_memberships
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER venture_memberships_bump_version BEFORE UPDATE ON venture_memberships
  FOR EACH ROW EXECUTE FUNCTION app.bump_membership_version();
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION app.reject_audit_mutation();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_audit_mutation();

-- ---------------------------------------------------------------------------
-- Function ownership and execute privileges
-- ---------------------------------------------------------------------------
GRANT SELECT ON users TO dxo_definer;
GRANT SELECT, INSERT ON ventures TO dxo_definer;
GRANT SELECT, INSERT ON venture_memberships TO dxo_definer;

ALTER FUNCTION app.venture_role(uuid) OWNER TO dxo_definer;
ALTER FUNCTION app.has_venture_access(uuid) OWNER TO dxo_definer;
ALTER FUNCTION app.shares_venture_with(uuid) OWNER TO dxo_definer;
ALTER FUNCTION app.create_venture(text, text, text, char, char, text) OWNER TO dxo_definer;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  app.current_actor_type(), app.current_user_id(), app.current_service_id(),
  app.current_venture_id(), app.venture_role(uuid), app.has_venture_access(uuid),
  app.has_current_venture_access(), app.in_venture_context(uuid),
  app.has_venture_role(uuid, venture_role[]), app.shares_venture_with(uuid),
  app.touch_updated_at(), app.bump_membership_version(), app.reject_audit_mutation()
  TO dxo_app, dxo_auth, dxo_definer;
GRANT EXECUTE ON FUNCTION app.create_venture(text, text, text, char, char, text) TO dxo_app;

-- ---------------------------------------------------------------------------
-- users — identity store (not venture-owned)
-- ---------------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON users TO dxo_auth;
CREATE POLICY users_auth_all ON users FOR ALL TO dxo_auth USING (true) WITH CHECK (true);

-- Runtime role: read-only, column-restricted, self and co-members only.
GRANT SELECT (id, name, email, email_verified, image, two_factor_enabled, created_at) ON users TO dxo_app;
CREATE POLICY users_app_select ON users FOR SELECT TO dxo_app
  USING (id = app.current_user_id() OR app.shares_venture_with(id));

-- ---------------------------------------------------------------------------
-- ventures — the tenant
-- ---------------------------------------------------------------------------
ALTER TABLE ventures ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventures FORCE ROW LEVEL SECURITY;

GRANT SELECT ON ventures TO dxo_app;
GRANT UPDATE (name, legal_name, company_number, country_code, reporting_currency,
              timezone, status, archived_at) ON ventures TO dxo_app;
-- No INSERT (use app.create_venture) and no DELETE (archive instead) for dxo_app.

-- Listing does not require an active venture so the venture switcher can show all
-- ventures the user belongs to. All other venture data requires the active context.
CREATE POLICY ventures_member_select ON ventures FOR SELECT TO dxo_app
  USING (app.has_venture_access(id));
CREATE POLICY ventures_admin_update ON ventures FOR UPDATE TO dxo_app
  USING (app.in_venture_context(id) AND app.has_venture_role(id, '{owner,admin}'))
  WITH CHECK (app.in_venture_context(id) AND app.has_venture_role(id, '{owner,admin}'));

-- ---------------------------------------------------------------------------
-- venture_memberships
-- ---------------------------------------------------------------------------
ALTER TABLE venture_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE venture_memberships FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON venture_memberships TO dxo_app;
GRANT UPDATE (role, status, removed_at) ON venture_memberships TO dxo_app;
-- No DELETE: removal is a status change so history and audit references remain.

-- Users can always see their own memberships (venture switcher); members of the
-- active venture can see its membership list.
CREATE POLICY venture_memberships_select ON venture_memberships FOR SELECT TO dxo_app
  USING (user_id = app.current_user_id() OR app.in_venture_context(venture_id));

-- Owners manage any non-owner membership; Admins manage only Manager/Operator/Viewer.
-- Owner rows are never written here: ownership transfer is a dedicated audited function.
CREATE POLICY venture_memberships_insert ON venture_memberships FOR INSERT TO dxo_app
  WITH CHECK (
    app.in_venture_context(venture_id)
    AND role <> 'owner'
    AND (app.has_venture_role(venture_id, '{owner}')
         OR (app.has_venture_role(venture_id, '{admin}') AND role <> 'admin')));

CREATE POLICY venture_memberships_update ON venture_memberships FOR UPDATE TO dxo_app
  USING (
    app.in_venture_context(venture_id)
    AND role <> 'owner'
    AND (app.has_venture_role(venture_id, '{owner}')
         OR (app.has_venture_role(venture_id, '{admin}') AND role <> 'admin')))
  WITH CHECK (
    app.in_venture_context(venture_id)
    AND role <> 'owner'
    AND (app.has_venture_role(venture_id, '{owner}')
         OR (app.has_venture_role(venture_id, '{admin}') AND role <> 'admin')));


-- ---------------------------------------------------------------------------
-- audit_log — append-only; venture_id NULL for account-level events (ADR-0008)
-- ---------------------------------------------------------------------------
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON audit_log TO dxo_app;
GRANT INSERT ON audit_log TO dxo_auth;

-- Actors cannot be spoofed: the recorded actor must match the transaction context.
CREATE POLICY audit_log_app_insert ON audit_log FOR INSERT TO dxo_app
  WITH CHECK (
    (actor_type = 'user' AND actor_user_id = app.current_user_id()
      AND (venture_id IS NULL OR app.in_venture_context(venture_id)))
    OR
    (actor_type IN ('service', 'system') AND actor_service = app.current_service_id()
      AND (venture_id IS NULL OR app.in_venture_context(venture_id))));

-- Better Auth writes account-level security events only.
CREATE POLICY audit_log_auth_insert ON audit_log FOR INSERT TO dxo_auth
  WITH CHECK (venture_id IS NULL);

-- Venture events: Owner/Admin of the active venture. Account events: the user they concern.
CREATE POLICY audit_log_app_select ON audit_log FOR SELECT TO dxo_app
  USING (
    (venture_id IS NOT NULL AND app.in_venture_context(venture_id)
      AND app.has_venture_role(venture_id, '{owner,admin}'))
    OR
    (venture_id IS NULL AND app.current_user_id() IS NOT NULL
      AND (subject_user_id = app.current_user_id() OR actor_user_id = app.current_user_id())));
