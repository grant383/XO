-- =============================================================================
-- 0005 Venture lifecycle and onboarding (hand-written; see docs/adr/0012)
--
-- * app.create_venture() atomically creates venture + Owner membership + onboarding
--   state + audit record, with an optional idempotency key.
-- * app.complete_venture_onboarding() revalidates, completes onboarding and moves the
--   venture draft -> active in one transaction, with audit records.
-- * Lifecycle transitions are enforced by trigger; the runtime role cannot write
--   `ventures.status` at all.
--
-- Custom SQLSTATEs (mapped by the ventures module):
--   DXV01 draft venture limit reached      DXV02 onboarding steps incomplete
--   DXV03 not permitted (not active Owner) DXV04 invalid lifecycle state
--   DXV05 invalid venture settings
-- =============================================================================

-- Correlation id for audit rows written inside SECURITY DEFINER functions.
CREATE FUNCTION app.current_correlation_id() RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT nullif(current_setting('app.correlation_id', true), '') $$;

-- ---------------------------------------------------------------------------
-- Venture creation (replaces the 0001 version; existing positional calls still work)
-- ---------------------------------------------------------------------------
DROP FUNCTION app.create_venture(text, text, text, char, char, text);

CREATE FUNCTION app.create_venture(
  p_name text,
  p_legal_name text DEFAULT NULL,
  p_company_number text DEFAULT NULL,
  p_country_code char(2) DEFAULT 'GB',
  p_reporting_currency char(3) DEFAULT 'GBP',
  p_timezone text DEFAULT 'Europe/London',
  p_request_id uuid DEFAULT NULL
) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
  DECLARE
    v_user_id uuid := app.current_user_id();
    v_venture_id uuid;
    v_drafts integer;
  BEGIN
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'create_venture requires an authenticated user context'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF coalesce(btrim(p_name), '') = '' THEN
      RAISE EXCEPTION 'venture name is required' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = p_timezone) THEN
      RAISE EXCEPTION 'invalid timezone' USING ERRCODE = 'DXV05';
    END IF;

    -- Idempotent retry: the same request id returns the venture already created.
    IF p_request_id IS NOT NULL THEN
      SELECT v.id INTO v_venture_id FROM public.ventures v
      WHERE v.created_by = v_user_id AND v.creation_request_id = p_request_id;
      IF v_venture_id IS NOT NULL THEN
        RETURN v_venture_id;
      END IF;
    END IF;

    -- Serialise creations per user so the draft limit cannot be raced.
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 42));
    SELECT count(*) INTO v_drafts FROM public.ventures v
    WHERE v.created_by = v_user_id AND v.status = 'draft';
    IF v_drafts >= 5 THEN
      RAISE EXCEPTION 'draft venture limit reached' USING ERRCODE = 'DXV01';
    END IF;

    BEGIN
      INSERT INTO public.ventures (name, legal_name, company_number, country_code,
                                   reporting_currency, timezone, created_by, creation_request_id)
      VALUES (btrim(p_name), nullif(btrim(p_legal_name), ''), p_company_number, p_country_code,
              p_reporting_currency, p_timezone, v_user_id, p_request_id)
      RETURNING id INTO v_venture_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT v.id INTO v_venture_id FROM public.ventures v
      WHERE v.created_by = v_user_id AND v.creation_request_id = p_request_id;
      RETURN v_venture_id;
    END;

    INSERT INTO public.venture_memberships (venture_id, user_id, role)
    VALUES (v_venture_id, v_user_id, 'owner');

    INSERT INTO public.venture_onboarding (venture_id, updated_by)
    VALUES (v_venture_id, v_user_id);

    INSERT INTO public.audit_log (venture_id, actor_type, actor_user_id, subject_user_id, action,
                                  target_type, target_id, metadata, correlation_id)
    VALUES (v_venture_id, 'user', v_user_id, v_user_id, 'venture.created', 'venture',
            v_venture_id::text, jsonb_build_object('status', 'draft'), app.current_correlation_id());

    RETURN v_venture_id;
  END
  $$;

-- ---------------------------------------------------------------------------
-- Onboarding completion: the only path from draft to active.
-- ---------------------------------------------------------------------------
CREATE FUNCTION app.complete_venture_onboarding(p_venture_id uuid) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
  DECLARE
    v_user_id uuid := app.current_user_id();
    v public.ventures%ROWTYPE;
    o public.venture_onboarding%ROWTYPE;
    v_invalid text[] := '{}';
  BEGIN
    -- Authorisation: the caller must be the active Owner, acting in this venture's
    -- context. Unknown and inaccessible ventures produce the same error.
    IF v_user_id IS NULL OR p_venture_id IS DISTINCT FROM app.current_venture_id()
       OR NOT EXISTS (
         SELECT 1 FROM public.venture_memberships m
         WHERE m.venture_id = p_venture_id AND m.user_id = v_user_id
           AND m.status = 'active' AND m.role = 'owner') THEN
      RAISE EXCEPTION 'not permitted' USING ERRCODE = 'DXV03';
    END IF;

    SELECT * INTO v FROM public.ventures WHERE id = p_venture_id FOR UPDATE;
    SELECT * INTO o FROM public.venture_onboarding WHERE venture_id = p_venture_id FOR UPDATE;
    IF v.status <> 'draft' OR o.venture_id IS NULL OR o.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'venture is not awaiting onboarding' USING ERRCODE = 'DXV04';
    END IF;
    IF o.business_completed_at IS NULL OR o.data_connections_completed_at IS NULL THEN
      RAISE EXCEPTION 'onboarding steps incomplete' USING ERRCODE = 'DXV02';
    END IF;

    -- Revalidate everything the venture needs to operate.
    IF length(btrim(v.name)) = 0 THEN v_invalid := array_append(v_invalid, 'name'); END IF;
    IF v.sector IS NULL THEN v_invalid := array_append(v_invalid, 'sector'); END IF;
    IF v.fiscal_year_start_month IS NULL THEN v_invalid := array_append(v_invalid, 'fiscalYearStartMonth'); END IF;
    IF v.reporting_currency !~ '^[A-Z]{3}$' THEN v_invalid := array_append(v_invalid, 'reportingCurrency'); END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v.timezone) THEN
      v_invalid := array_append(v_invalid, 'timezone');
    END IF;
    IF o.company_verification_status = 'verified' AND coalesce(btrim(v.legal_name), '') = '' THEN
      v_invalid := array_append(v_invalid, 'legalName');
    END IF;
    IF array_length(v_invalid, 1) > 0 THEN
      RAISE EXCEPTION 'invalid venture settings: %', array_to_string(v_invalid, ',')
        USING ERRCODE = 'DXV05';
    END IF;

    UPDATE public.venture_onboarding
    SET review_completed_at = now(), completed_at = now(), current_step = 'completed',
        updated_by = v_user_id
    WHERE venture_id = p_venture_id;

    UPDATE public.ventures SET status = 'active' WHERE id = p_venture_id;

    INSERT INTO public.audit_log (venture_id, actor_type, actor_user_id, action, target_type,
                                  target_id, metadata, correlation_id)
    VALUES
      (p_venture_id, 'user', v_user_id, 'venture.onboarding.completed', 'venture',
       p_venture_id::text,
       jsonb_build_object('companyVerification', o.company_verification_status::text),
       app.current_correlation_id()),
      (p_venture_id, 'user', v_user_id, 'venture.activated', 'venture', p_venture_id::text,
       jsonb_build_object('from', 'draft', 'to', 'active'), app.current_correlation_id());
  END
  $$;

-- ---------------------------------------------------------------------------
-- Lifecycle transitions (defence in depth for every role, including definers)
-- ---------------------------------------------------------------------------
CREATE FUNCTION app.enforce_venture_status_transition() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  DECLARE
    v_from text := OLD.status::text;
    v_to text := NEW.status::text;
  BEGIN
    IF v_from = 'draft' AND v_to = 'active' THEN
      IF NOT EXISTS (SELECT 1 FROM public.venture_onboarding o
                     WHERE o.venture_id = NEW.id AND o.completed_at IS NOT NULL) THEN
        RAISE EXCEPTION 'a venture becomes active only by completing onboarding'
          USING ERRCODE = 'DXV04';
      END IF;
    ELSIF (v_from, v_to) NOT IN (('draft', 'archived'), ('active', 'suspended'),
                                 ('suspended', 'active'), ('active', 'archived'),
                                 ('suspended', 'archived')) THEN
      RAISE EXCEPTION 'invalid venture status transition % -> %', v_from, v_to
        USING ERRCODE = 'DXV04';
    END IF;
    RETURN NEW;
  END
  $$;

CREATE TRIGGER ventures_status_transition BEFORE UPDATE OF status ON ventures
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION app.enforce_venture_status_transition();

CREATE TRIGGER venture_onboarding_touch_updated_at BEFORE UPDATE ON venture_onboarding
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Grants and ownership
-- ---------------------------------------------------------------------------
-- Lifecycle is changed only through definer functions.
REVOKE UPDATE (status, archived_at) ON ventures FROM dxo_app;
GRANT UPDATE (sector, fiscal_year_start_month) ON ventures TO dxo_app;

GRANT UPDATE (status) ON ventures TO dxo_definer;
GRANT SELECT, INSERT, UPDATE ON venture_onboarding TO dxo_definer;
GRANT INSERT ON audit_log TO dxo_definer;

ALTER FUNCTION app.create_venture(text, text, text, char, char, text, uuid) OWNER TO dxo_definer;
ALTER FUNCTION app.complete_venture_onboarding(uuid) OWNER TO dxo_definer;

REVOKE ALL ON FUNCTION app.create_venture(text, text, text, char, char, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.complete_venture_onboarding(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.enforce_venture_status_transition() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.current_correlation_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.create_venture(text, text, text, char, char, text, uuid) TO dxo_app;
GRANT EXECUTE ON FUNCTION app.complete_venture_onboarding(uuid) TO dxo_app;
GRANT EXECUTE ON FUNCTION app.enforce_venture_status_transition(), app.current_correlation_id()
  TO dxo_app, dxo_auth, dxo_definer;

-- ---------------------------------------------------------------------------
-- venture_onboarding — readable by members of the venture; progress writable by
-- the Owner only, and never once completed. Completion columns are definer-only.
-- ---------------------------------------------------------------------------
ALTER TABLE venture_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE venture_onboarding FORCE ROW LEVEL SECURITY;

GRANT SELECT ON venture_onboarding TO dxo_app;
GRANT UPDATE (current_step, business_completed_at, data_connections_completed_at,
              company_verification_status, company_verification, company_verified_at,
              updated_by)
  ON venture_onboarding TO dxo_app;

CREATE POLICY venture_onboarding_select ON venture_onboarding FOR SELECT TO dxo_app
  USING (app.in_venture_context(venture_id));

CREATE POLICY venture_onboarding_owner_update ON venture_onboarding FOR UPDATE TO dxo_app
  USING (app.in_venture_context(venture_id)
         AND app.has_venture_role(venture_id, '{owner}')
         AND completed_at IS NULL)
  WITH CHECK (app.in_venture_context(venture_id)
              AND app.has_venture_role(venture_id, '{owner}')
              AND completed_at IS NULL
              AND current_step <> 'completed'
              AND updated_by = app.current_user_id());
