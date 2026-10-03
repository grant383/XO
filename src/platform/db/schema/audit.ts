import { sql } from "drizzle-orm";
import { check, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id } from "./types";

export const auditActorType = pgEnum("audit_actor_type", [
  "user",
  "service",
  "system",
  "anonymous",
]);
export const auditOutcome = pgEnum("audit_outcome", ["success", "failure", "denied"]);

/**
 * Append-only audit trail (spec §6, §15, §20). UPDATE/DELETE are not granted to any
 * runtime role and are rejected by trigger.
 *
 * `venture_id` is NULL for account-level events (login, logout, password reset, MFA,
 * session revocation, billing-account activity) — see ADR-0008.
 *
 * User/venture references are intentionally not foreign keys: audit evidence must
 * survive deletion of the referenced records.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    ventureId: uuid("venture_id"),
    actorType: auditActorType("actor_type").notNull(),
    actorUserId: uuid("actor_user_id"),
    actorService: text("actor_service"),
    /** The user an account-level event is about (e.g. whose password was reset). */
    subjectUserId: uuid("subject_user_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    outcome: auditOutcome("outcome").notNull().default("success"),
    metadata: jsonb("metadata").notNull().default({}),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    correlationId: text("correlation_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "audit_log_actor_identity_ck",
      sql`(${t.actorType} <> 'user' or ${t.actorUserId} is not null)
          and (${t.actorType} <> 'service' or ${t.actorService} is not null)`,
    ),
    check(
      "audit_log_account_event_subject_ck",
      sql`${t.ventureId} is not null or ${t.subjectUserId} is not null
          or ${t.actorUserId} is not null or ${t.actorType} = 'anonymous'`,
    ),
    index("audit_log_venture_time_idx").on(t.ventureId, t.occurredAt.desc()),
    index("audit_log_subject_time_idx").on(t.subjectUserId, t.occurredAt.desc()),
    index("audit_log_actor_time_idx").on(t.actorUserId, t.occurredAt.desc()),
  ],
);
