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
