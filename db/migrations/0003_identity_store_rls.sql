-- =============================================================================
-- 0003 Identity store RLS (hand-written; see docs/adr/0007 and docs/adr/0009)
--
-- Sessions, credentials, verification values and consumed-token records belong to
-- the identity store. Only `dxo_auth` (Better Auth) may read or write them; the
-- runtime `dxo_app` role receives no grants, so venture code can never read a
-- session token or password hash even through a bug in application code.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO dxo_auth;
CREATE POLICY sessions_auth_all ON sessions FOR ALL TO dxo_auth USING (true) WITH CHECK (true);
CREATE TRIGGER sessions_touch_updated_at BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- accounts (credentials)
-- ---------------------------------------------------------------------------
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON accounts TO dxo_auth;
CREATE POLICY accounts_auth_all ON accounts FOR ALL TO dxo_auth USING (true) WITH CHECK (true);
CREATE TRIGGER accounts_touch_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- verifications (single-use, expiring; identifiers stored hashed)
-- ---------------------------------------------------------------------------
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifications FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON verifications TO dxo_auth;
CREATE POLICY verifications_auth_all ON verifications FOR ALL TO dxo_auth USING (true) WITH CHECK (true);
CREATE TRIGGER verifications_touch_updated_at BEFORE UPDATE ON verifications
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- auth_consumed_tokens — insert-only from the runtime's perspective; a consumed
-- token can never be "un-consumed". Expired rows are purged by a maintenance job.
-- ---------------------------------------------------------------------------
ALTER TABLE auth_consumed_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_consumed_tokens FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON auth_consumed_tokens TO dxo_auth;
CREATE POLICY auth_consumed_tokens_auth_select ON auth_consumed_tokens FOR SELECT TO dxo_auth USING (true);
CREATE POLICY auth_consumed_tokens_auth_insert ON auth_consumed_tokens FOR INSERT TO dxo_auth WITH CHECK (true);
