-- =============================================================================
-- 0009 Two-factor RLS (hand-written; see docs/adr/0009 and docs/adr/0016)
--
-- TOTP secrets and recovery codes belong to the identity store. Only `dxo_auth`
-- (Better Auth) may read or write them. The runtime `dxo_app` role receives no
-- grants: venture code can never read an MFA secret, even through a bug. The
-- secret and recovery codes are additionally encrypted by Better Auth before
-- they reach the database.
-- =============================================================================

ALTER TABLE two_factors ENABLE ROW LEVEL SECURITY;
ALTER TABLE two_factors FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON two_factors TO dxo_auth;
CREATE POLICY two_factors_auth_all ON two_factors FOR ALL TO dxo_auth USING (true) WITH CHECK (true);
CREATE TRIGGER two_factors_touch_updated_at BEFORE UPDATE ON two_factors
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
