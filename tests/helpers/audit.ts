import type { Sql } from "postgres";

export type AuditRow = {
  action: string;
  outcome: string;
  actor_type: string;
  actor_user_id: string | null;
  subject_user_id: string | null;
  venture_id: string | null;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  correlation_id: string | null;
};

/** Account-level events about a user, oldest first. */
export async function auditFor(admin: Sql, userId: string): Promise<AuditRow[]> {
  return admin<AuditRow[]>`
    select action, outcome, actor_type, actor_user_id, subject_user_id, venture_id,
           target_type, target_id, metadata, ip_address, user_agent, correlation_id
    from audit_log where subject_user_id = ${userId} or actor_user_id = ${userId}
    order by occurred_at, id`;
}

/** Events whose metadata matches (e.g. `{ accountKey }` for anonymous login failures). */
export async function auditWhere(admin: Sql, action: string, metadata: Record<string, unknown>) {
  return admin<AuditRow[]>`
    select action, outcome, actor_type, actor_user_id, subject_user_id, venture_id,
           target_type, target_id, metadata, ip_address, user_agent, correlation_id
    from audit_log where action = ${action} and metadata @> ${admin.json(metadata as never)}
    order by occurred_at, id`;
}
