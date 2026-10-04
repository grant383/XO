import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "postgres";

/**
 * Activates a seeded draft venture through its lifecycle rules: onboarding is recorded as
 * complete first, so the draft → active trigger accepts the transition.
 */
export async function activateVenture(admin: Sql, ventureId: string) {
  const [v] = await admin<
    { created_by: string }[]
  >`select created_by from ventures where id = ${ventureId}`;
  await admin`insert into venture_onboarding (venture_id, current_step, business_completed_at,
                data_connections_completed_at, review_completed_at, completed_at, updated_by)
              values (${ventureId}, 'completed', now(), now(), now(), now(), ${v!.created_by})
              on conflict (venture_id) do update set current_step = 'completed',
                business_completed_at = now(), data_connections_completed_at = now(),
                review_completed_at = now(), completed_at = now()`;
  await admin`update ventures set status = 'active' where id = ${ventureId}`;
}

/** A raw invitation token and its stored digest (SHA-256, base64url — ADR-0013). */
export function invitationToken() {
  const token = randomUUID().replaceAll("-", "").padEnd(43, "x").slice(0, 43);
  return { token, tokenHash: createHash("sha256").update(token).digest("base64url") };
}

/** Inserts an invitation directly (fixtures for database-level tests). */
export async function insertInvitation(
  admin: Sql,
  input: {
    ventureId: string;
    email: string;
    role: "admin" | "manager" | "operator" | "viewer";
    invitedBy: string;
    expiresAt?: Date;
  },
) {
  const { token, tokenHash } = invitationToken();
  const [row] = await admin<{ id: string }[]>`
    insert into venture_invitations (venture_id, email, role, token_hash, invited_by, expires_at)
    values (${input.ventureId}, ${input.email}, ${input.role}, ${tokenHash}, ${input.invitedBy},
            ${input.expiresAt ?? new Date(Date.now() + 86_400_000)})
    returning id`;
  return { id: row!.id, token, tokenHash };
}

type Role = "owner" | "admin" | "manager" | "operator" | "viewer";
export type TestActor = { userId: string; email: string; correlationId: string };

/** A verified user inserted directly, usable as a module `Actor`. */
export async function actor(admin: Sql, label: string): Promise<TestActor> {
  const userId = randomUUID();
  const email = `${label}-${userId.slice(0, 8)}@example.test`;
  await admin`insert into users (id, name, email, email_verified)
              values (${userId}, ${label}, ${email}, true)`;
  return { userId, email, correlationId: `corr-${userId.slice(0, 12)}` };
}

/** An active venture with one member per listed role (the first must be the Owner). */
export async function activeVenture<const L extends string>(
  admin: Sql,
  roles: Record<L, Role>,
): Promise<{ ventureId: string; people: Record<L, TestActor> }> {
  const entries = Object.entries(roles) as Array<[L, Role]>;
  const people = {} as Record<L, TestActor>;
  for (const [label] of entries) people[label] = await actor(admin, label);
  const owner = entries.find(([, r]) => r === "owner")![0];
  const ventureId = randomUUID();
  await admin`insert into ventures (id, name, created_by)
              values (${ventureId}, ${`Team Co ${ventureId.slice(0, 6)}`}, ${people[owner].userId})`;
  for (const [label, role] of [
    ...entries.filter(([, r]) => r === "owner"),
    ...entries.filter(([, r]) => r !== "owner"),
  ]) {
    await admin`insert into venture_memberships (venture_id, user_id, role)
                values (${ventureId}, ${people[label].userId}, ${role})`;
  }
  await activateVenture(admin, ventureId);
  return { ventureId, people };
}

export async function membershipOf(admin: Sql, ventureId: string, userId: string) {
  const [m] = await admin<{ id: string; role: Role; status: string; version: number }[]>`
    select id, role, status, version from venture_memberships
    where venture_id = ${ventureId} and user_id = ${userId}`;
  return m;
}

export async function ventureAudit(admin: Sql, ventureId: string) {
  return admin<
    {
      action: string;
      actor_user_id: string | null;
      subject_user_id: string | null;
      target_type: string | null;
      target_id: string | null;
      metadata: Record<string, unknown>;
      correlation_id: string | null;
    }[]
  >`select action, actor_user_id, subject_user_id, target_type, target_id, metadata, correlation_id
    from audit_log where venture_id = ${ventureId} order by occurred_at, id`;
}

/**
 * Makes a pending invitation lapse. Invitation terms (including `expires_at`) are immutable
 * for every role, so this superuser fixture skips triggers for its own transaction only.
 */
export async function backdateInvitation(admin: Sql, invitationId: string) {
  await admin.begin(async (tx) => {
    await tx`set local session_replication_role = replica`;
    await tx`update venture_invitations set expires_at = now() - interval '1 minute'
              where id = ${invitationId} and status = 'pending'`;
  });
}
