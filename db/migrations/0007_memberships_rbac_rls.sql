-- =============================================================================
-- 0007 Memberships, RBAC, invitations and access requests (hand-written; see
-- docs/adr/0013-memberships-rbac-invitations.md)
--
-- * Owner invariant: a trigger (applies to every role, including definers) forbids
--   demoting, suspending or removing the Owner and assigning Owner after creation.
-- * Invitations: Owner/Admin create and revoke under RLS; acceptance only through
--   app.accept_venture_invitation(), which validates the token digest, expiry, state,
--   invitee identity, venture state and the inviter's continuing authority, then creates
--   or reactivates the membership atomically with audit records.
-- * Access requests: created only through app.request_venture_access(), whose outcome
--   is identical whether or not the venture exists; reviewed by Owner/Admin under RLS.
-- * Role-assignment rules mirror venture_memberships (0001): Owner manages any non-owner
--   role; Admin manages Manager/Operator/Viewer only.
--
-- Custom SQLSTATEs (mapped by the memberships module):
--   DXM01 invitation invalid (unknown, not pending, venture inactive, inviter no longer authorised)
--   DXM02 invitation expired          DXM03 invitation is for a different account
--   DXM04 already an active member    DXM05 membership suspended
--   DXM07 Owner invariant violation   DXM08 invalid state transition
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Role-assignment rule shared by the policies below (SECURITY INVOKER).
-- ---------------------------------------------------------------------------
CREATE FUNCTION app.can_manage_role(p_venture_id uuid, p_role venture_role) RETURNS boolean
  LANGUAGE sql STABLE
  AS $$
    SELECT p_role IS NOT NULL AND p_role <> 'owner'
       AND (app.has_venture_role(p_venture_id, '{owner}')
            OR (app.has_venture_role(p_venture_id, '{admin}') AND p_role <> 'admin'))
  $$;

-- ---------------------------------------------------------------------------
-- Membership invariants (defence in depth for every role)
-- ---------------------------------------------------------------------------
CREATE FUNCTION app.enforce_membership_rules() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF TG_OP = 'INSERT' THEN
      -- The Owner row is created only with the venture itself (app.create_venture).
      IF NEW.role = 'owner' AND EXISTS (
           SELECT 1 FROM public.venture_memberships m WHERE m.venture_id = NEW.venture_id) THEN
        RAISE EXCEPTION 'a venture has exactly one Owner' USING ERRCODE = 'insufficient_privilege';
      END IF;
      NEW.removed_at := CASE WHEN NEW.status = 'removed' THEN now() END;
      RETURN NEW;
    END IF;

    IF NEW.venture_id IS DISTINCT FROM OLD.venture_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'membership identity is immutable' USING ERRCODE = 'DXM08';
    END IF;
    IF OLD.role = 'owner' AND (NEW.role <> 'owner' OR NEW.status <> 'active') THEN
      RAISE EXCEPTION 'the venture Owner cannot be demoted, suspended or removed'
        USING ERRCODE = 'DXM07';
    END IF;
    IF NEW.role = 'owner' AND OLD.role <> 'owner' THEN
      RAISE EXCEPTION 'the Owner role cannot be assigned' USING ERRCODE = 'DXM07';
    END IF;

    IF NEW.status = 'removed' AND OLD.status <> 'removed' THEN
      NEW.removed_at := now();
    ELSIF NEW.status <> 'removed' THEN
      NEW.removed_at := NULL;
    END IF;
    RETURN NEW;
  END
  $$;

CREATE TRIGGER venture_memberships_rules BEFORE INSERT OR UPDATE ON venture_memberships
  FOR EACH ROW EXECUTE FUNCTION app.enforce_membership_rules();

-- Pending is the only state that can change; everything else is terminal.
CREATE FUNCTION app.enforce_invitation_transition() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'invitation is no longer pending' USING ERRCODE = 'DXM08';
    END IF;
    IF (NEW.venture_id, NEW.email, NEW.role, NEW.token_hash, NEW.invited_by, NEW.expires_at)
       IS DISTINCT FROM
       (OLD.venture_id, OLD.email, OLD.role, OLD.token_hash, OLD.invited_by, OLD.expires_at) THEN
      RAISE EXCEPTION 'invitation terms are immutable' USING ERRCODE = 'DXM08';
    END IF;
    RETURN NEW;
  END
  $$;

CREATE TRIGGER venture_invitations_transition BEFORE UPDATE ON venture_invitations
  FOR EACH ROW EXECUTE FUNCTION app.enforce_invitation_transition();
CREATE TRIGGER venture_invitations_touch_updated_at BEFORE UPDATE ON venture_invitations
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE FUNCTION app.enforce_access_request_transition() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'access request has already been reviewed' USING ERRCODE = 'DXM08';
    END IF;
    IF (NEW.venture_id, NEW.requester_user_id) IS DISTINCT FROM (OLD.venture_id, OLD.requester_user_id) THEN
      RAISE EXCEPTION 'access request identity is immutable' USING ERRCODE = 'DXM08';
    END IF;
    RETURN NEW;
  END
  $$;

CREATE TRIGGER venture_access_requests_transition BEFORE UPDATE ON venture_access_requests
  FOR EACH ROW EXECUTE FUNCTION app.enforce_access_request_transition();
CREATE TRIGGER venture_access_requests_touch_updated_at BEFORE UPDATE ON venture_access_requests
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Access request submission. The caller learns nothing about the venture: unknown,
-- inactive, already-joined, duplicate and over-limit requests all return the same way.
-- ---------------------------------------------------------------------------
CREATE FUNCTION app.request_venture_access(p_venture_id uuid) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
  DECLARE
    v_user_id uuid := app.current_user_id();
    v_name text;
    v_email text;
    v_verified boolean;
    v_request_id uuid;
  BEGIN
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'request_venture_access requires an authenticated user context'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT u.name, u.email::text, u.email_verified INTO v_name, v_email, v_verified
    FROM public.users u WHERE u.id = v_user_id;
    IF NOT coalesce(v_verified, false) THEN
      RAISE EXCEPTION 'a verified account is required' USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Serialise per requester so the pending cap cannot be raced.
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('access-request:' || v_user_id::text, 43));
    IF (SELECT count(*) FROM public.venture_access_requests r
        WHERE r.requester_user_id = v_user_id AND r.status = 'pending') >= 10 THEN
      RETURN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ventures v
                   WHERE v.id = p_venture_id AND v.status = 'active') THEN
      RETURN;
    END IF;
    -- Active or suspended members cannot request (suspension is an Owner/Admin decision).
    IF EXISTS (SELECT 1 FROM public.venture_memberships m
               WHERE m.venture_id = p_venture_id AND m.user_id = v_user_id
                 AND m.status <> 'removed') THEN
      RETURN;
    END IF;

    INSERT INTO public.venture_access_requests (venture_id, requester_user_id, requester_name,
                                                requester_email)
    VALUES (p_venture_id, v_user_id, v_name, v_email)
    ON CONFLICT (venture_id, requester_user_id) WHERE status = 'pending' DO NOTHING
    RETURNING id INTO v_request_id;
    IF v_request_id IS NULL THEN
      RETURN;
    END IF;

    INSERT INTO public.audit_log (venture_id, actor_type, actor_user_id, subject_user_id, action,
                                  target_type, target_id, metadata, correlation_id)
    VALUES (p_venture_id, 'user', v_user_id, v_user_id, 'venture.access_request.created',
            'access_request', v_request_id::text, '{}'::jsonb, app.current_correlation_id());
  END
  $$;

-- ---------------------------------------------------------------------------
-- Invitation preview for the signed-in token holder. Details are returned only to the
-- account the invitation was sent to.
-- ---------------------------------------------------------------------------
CREATE FUNCTION app.preview_venture_invitation(p_token_hash text)
  RETURNS TABLE (state text, venture_id uuid, venture_name text, role public.venture_role,
                 inviter_name text, expires_at timestamptz)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
  DECLARE
    v_user_id uuid := app.current_user_id();
    v_email text;
    i public.venture_invitations%ROWTYPE;
    v_venture public.ventures%ROWTYPE;
    v_inviter_role public.venture_role;
    v_member_status public.membership_status;
  BEGIN
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'preview_venture_invitation requires an authenticated user context'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT u.email::text INTO v_email FROM public.users u
    WHERE u.id = v_user_id AND u.email_verified;

    SELECT * INTO i FROM public.venture_invitations x WHERE x.token_hash = p_token_hash;
    IF i.id IS NULL OR i.status <> 'pending' THEN
      RETURN QUERY SELECT 'invalid', NULL::uuid, NULL::text, NULL::public.venture_role, NULL::text, NULL::timestamptz;
      RETURN;
    END IF;
    IF v_email IS NULL OR lower(v_email) <> lower(i.email::text) THEN
      RETURN QUERY SELECT 'wrong_account', NULL::uuid, NULL::text, NULL::public.venture_role, NULL::text, NULL::timestamptz;
      RETURN;
    END IF;
    IF i.expires_at <= now() THEN
      RETURN QUERY SELECT 'expired', NULL::uuid, NULL::text, NULL::public.venture_role, NULL::text, NULL::timestamptz;
      RETURN;
    END IF;

    SELECT * INTO v_venture FROM public.ventures v WHERE v.id = i.venture_id;
    SELECT m.role INTO v_inviter_role FROM public.venture_memberships m
    WHERE m.venture_id = i.venture_id AND m.user_id = i.invited_by AND m.status = 'active';
    IF v_venture.status <> 'active' OR v_inviter_role IS NULL
       OR NOT (v_inviter_role = 'owner' OR (v_inviter_role = 'admin' AND i.role <> 'admin')) THEN
      RETURN QUERY SELECT 'invalid', NULL::uuid, NULL::text, NULL::public.venture_role, NULL::text, NULL::timestamptz;
      RETURN;
    END IF;

    SELECT m.status INTO v_member_status FROM public.venture_memberships m
    WHERE m.venture_id = i.venture_id AND m.user_id = v_user_id;
    RETURN QUERY
      SELECT CASE v_member_status WHEN 'active' THEN 'already_member'
                                  WHEN 'suspended' THEN 'suspended'
                                  ELSE 'valid' END,
             v_venture.id, v_venture.name, i.role,
             (SELECT u.name FROM public.users u WHERE u.id = i.invited_by), i.expires_at;
  END
  $$;

-- ---------------------------------------------------------------------------
-- Invitation acceptance: the only path from invitation to membership. Everything is
-- revalidated under row locks; any failure leaves no membership and no state change.
-- ---------------------------------------------------------------------------
CREATE FUNCTION app.accept_venture_invitation(p_token_hash text) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
  DECLARE
    v_user_id uuid := app.current_user_id();
    v_email text;
    i public.venture_invitations%ROWTYPE;
    v_inviter_role public.venture_role;
    m public.venture_memberships%ROWTYPE;
    v_membership_id uuid;
    v_action text;
  BEGIN
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'accept_venture_invitation requires an authenticated user context'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT u.email::text INTO v_email FROM public.users u
    WHERE u.id = v_user_id AND u.email_verified;

    SELECT * INTO i FROM public.venture_invitations x WHERE x.token_hash = p_token_hash FOR UPDATE;
    IF i.id IS NULL OR i.status <> 'pending' THEN
      RAISE EXCEPTION 'invitation invalid' USING ERRCODE = 'DXM01';
    END IF;
    IF v_email IS NULL OR lower(v_email) <> lower(i.email::text) THEN
      RAISE EXCEPTION 'invitation is for a different account' USING ERRCODE = 'DXM03';
    END IF;
    IF i.expires_at <= now() THEN
      RAISE EXCEPTION 'invitation expired' USING ERRCODE = 'DXM02';
    END IF;

    -- Revalidate the intended venture and the inviter's continuing authority for the role.
    PERFORM 1 FROM public.ventures v WHERE v.id = i.venture_id AND v.status = 'active' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invitation invalid' USING ERRCODE = 'DXM01';
    END IF;
    SELECT x.role INTO v_inviter_role FROM public.venture_memberships x
    WHERE x.venture_id = i.venture_id AND x.user_id = i.invited_by AND x.status = 'active'
    FOR SHARE;
    IF v_inviter_role IS NULL
       OR NOT (v_inviter_role = 'owner' OR (v_inviter_role = 'admin' AND i.role <> 'admin')) THEN
      RAISE EXCEPTION 'invitation invalid' USING ERRCODE = 'DXM01';
    END IF;

    SELECT * INTO m FROM public.venture_memberships x
    WHERE x.venture_id = i.venture_id AND x.user_id = v_user_id FOR UPDATE;
    IF m.id IS NOT NULL AND m.status = 'active' THEN
      RAISE EXCEPTION 'already a member' USING ERRCODE = 'DXM04';
    ELSIF m.id IS NOT NULL AND m.status = 'suspended' THEN
      RAISE EXCEPTION 'membership suspended' USING ERRCODE = 'DXM05';
    ELSIF m.id IS NOT NULL THEN
      UPDATE public.venture_memberships
      SET role = i.role, status = 'active', invited_by = i.invited_by
      WHERE id = m.id;
      v_membership_id := m.id;
      v_action := 'venture.membership.reactivated';
    ELSE
      INSERT INTO public.venture_memberships (venture_id, user_id, role, invited_by)
      VALUES (i.venture_id, v_user_id, i.role, i.invited_by)
      RETURNING id INTO v_membership_id;
      v_action := 'venture.membership.created';
    END IF;

    UPDATE public.venture_invitations
    SET status = 'accepted', accepted_at = now(), accepted_by = v_user_id
    WHERE id = i.id;

    INSERT INTO public.audit_log (venture_id, actor_type, actor_user_id, subject_user_id, action,
                                  target_type, target_id, metadata, correlation_id)
    VALUES
      (i.venture_id, 'user', v_user_id, v_user_id, 'venture.invitation.accepted', 'invitation',
       i.id::text, jsonb_build_object('role', i.role::text, 'invitedBy', i.invited_by),
       app.current_correlation_id()),
      (i.venture_id, 'user', v_user_id, v_user_id, v_action, 'membership',
       v_membership_id::text,
       jsonb_build_object('role', i.role::text, 'source', 'invitation', 'invitationId', i.id),
       app.current_correlation_id());

    RETURN i.venture_id;
  END
  $$;

-- ---------------------------------------------------------------------------
-- Grants and ownership
-- ---------------------------------------------------------------------------
GRANT SELECT, UPDATE (status, accepted_at, accepted_by) ON venture_invitations TO dxo_definer;
GRANT SELECT, INSERT ON venture_access_requests TO dxo_definer;
GRANT UPDATE (role, status, removed_at, invited_by) ON venture_memberships TO dxo_definer;

ALTER FUNCTION app.request_venture_access(uuid) OWNER TO dxo_definer;
ALTER FUNCTION app.preview_venture_invitation(text) OWNER TO dxo_definer;
ALTER FUNCTION app.accept_venture_invitation(text) OWNER TO dxo_definer;

REVOKE ALL ON FUNCTION app.can_manage_role(uuid, venture_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.enforce_membership_rules() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.enforce_invitation_transition() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.enforce_access_request_transition() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.request_venture_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.preview_venture_invitation(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.accept_venture_invitation(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.can_manage_role(uuid, venture_role), app.enforce_membership_rules(),
  app.enforce_invitation_transition(), app.enforce_access_request_transition()
  TO dxo_app, dxo_definer;
GRANT EXECUTE ON FUNCTION app.request_venture_access(uuid), app.preview_venture_invitation(text),
  app.accept_venture_invitation(text)
  TO dxo_app;

-- ---------------------------------------------------------------------------
-- venture_invitations — Owner/Admin of the active venture only. No DELETE: revocation
-- is a status change so history and audit references remain.
-- ---------------------------------------------------------------------------
ALTER TABLE venture_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE venture_invitations FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON venture_invitations TO dxo_app;
GRANT UPDATE (status, revoked_at, revoked_by) ON venture_invitations TO dxo_app;

CREATE POLICY venture_invitations_select ON venture_invitations FOR SELECT TO dxo_app
  USING (app.in_venture_context(venture_id) AND app.has_venture_role(venture_id, '{owner,admin}'));

CREATE POLICY venture_invitations_insert ON venture_invitations FOR INSERT TO dxo_app
  WITH CHECK (
    app.in_venture_context(venture_id)
    AND app.can_manage_role(venture_id, role)
    AND invited_by = app.current_user_id()
    AND status = 'pending'
    AND expires_at > now() AND expires_at <= now() + interval '30 days'
    AND EXISTS (SELECT 1 FROM public.ventures v WHERE v.id = venture_id AND v.status = 'active'));

CREATE POLICY venture_invitations_update ON venture_invitations FOR UPDATE TO dxo_app
  USING (
    app.in_venture_context(venture_id)
    AND app.can_manage_role(venture_id, role)
    AND status = 'pending')
  WITH CHECK (
    app.in_venture_context(venture_id)
    AND app.can_manage_role(venture_id, role)
    AND ((status = 'revoked' AND revoked_by = app.current_user_id())
         OR (status = 'expired' AND expires_at <= now())));

-- ---------------------------------------------------------------------------
-- venture_access_requests — reviewed by Owner/Admin of the active venture. Inserted only
-- by app.request_venture_access(); requesters cannot read requests (no venture discovery).
-- ---------------------------------------------------------------------------
ALTER TABLE venture_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE venture_access_requests FORCE ROW LEVEL SECURITY;

GRANT SELECT ON venture_access_requests TO dxo_app;
GRANT UPDATE (status, granted_role, reviewed_by, reviewed_at) ON venture_access_requests TO dxo_app;

CREATE POLICY venture_access_requests_select ON venture_access_requests FOR SELECT TO dxo_app
  USING (app.in_venture_context(venture_id) AND app.has_venture_role(venture_id, '{owner,admin}'));

CREATE POLICY venture_access_requests_review ON venture_access_requests FOR UPDATE TO dxo_app
  USING (
    app.in_venture_context(venture_id)
    AND app.has_venture_role(venture_id, '{owner,admin}')
    AND status = 'pending')
  WITH CHECK (
    app.in_venture_context(venture_id)
    AND app.has_venture_role(venture_id, '{owner,admin}')
    AND reviewed_by = app.current_user_id()
    AND reviewed_at IS NOT NULL
    AND ((status = 'approved' AND app.can_manage_role(venture_id, granted_role))
         OR (status = 'rejected' AND granted_role IS NULL)));
