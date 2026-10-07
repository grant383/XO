-- =============================================================================
-- 0014 Command Centre tasks (hand-written; see docs/adr/0024-command-centre.md)
--
-- * Every active member of the venture in context reads tasks (Command is Viewer+).
-- * Only Operator+ creates tasks or changes their status, and only as themselves.
-- * The runtime role may update status columns only and can never delete: completion and
--   reopening are status changes, so "What changed" and the audit trail stay intact.
-- =============================================================================

ALTER TABLE command_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE command_tasks FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON command_tasks TO dxo_app;
GRANT UPDATE (status, status_changed_at, status_changed_by) ON command_tasks TO dxo_app;
-- No DELETE for any runtime role.

CREATE POLICY command_tasks_member_select ON command_tasks FOR SELECT TO dxo_app
  USING (venture_id = (SELECT app.current_venture_id())
         AND (SELECT app.has_current_venture_access()));

CREATE POLICY command_tasks_operator_insert ON command_tasks FOR INSERT TO dxo_app
  WITH CHECK (
    venture_id = (SELECT app.current_venture_id())
    AND (SELECT app.has_current_venture_access())
    AND app.has_venture_role(venture_id, '{owner,admin,manager,operator}')
    AND created_by = (SELECT app.current_user_id())
    AND status = 'open'
    AND status_changed_at IS NULL);

CREATE POLICY command_tasks_operator_update ON command_tasks FOR UPDATE TO dxo_app
  USING (
    venture_id = (SELECT app.current_venture_id())
    AND (SELECT app.has_current_venture_access())
    AND app.has_venture_role(venture_id, '{owner,admin,manager,operator}'))
  WITH CHECK (
    venture_id = (SELECT app.current_venture_id())
    AND (SELECT app.has_current_venture_access())
    AND app.has_venture_role(venture_id, '{owner,admin,manager,operator}')
    AND status_changed_by = (SELECT app.current_user_id()));

CREATE TRIGGER command_tasks_touch_updated_at BEFORE UPDATE ON command_tasks
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
