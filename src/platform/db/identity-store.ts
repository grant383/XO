import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import { authPoolDb } from "./internal/clients";
import { accounts, auditLog, authConsumedTokens, sessions, users, verifications } from "./schema";

/**
 * Identity-store gateway (ADR-0009). Everything here runs as `dxo_auth`, which can reach
 * identity tables and append account-level audit events only — never venture data.
 * The raw pool stays inside `platform/db`; callers receive narrow capabilities.
 */

/** Better Auth database adapter bound to the identity-store role. */
export function identityStoreAdapter() {
  return drizzleAdapter(authPoolDb(), {
    provider: "pg",
    usePlural: true,
    schema: { users, sessions, accounts, verifications },
  });
}

export type AccountAuditEvent = {
  action: string;
  outcome: "success" | "failure" | "denied";
  actorType: "user" | "anonymous" | "system";
  actorUserId?: string | null;
  subjectUserId?: string | null;
  targetType?: string;
  targetId?: string;
  /** Must never contain passwords, tokens, cookies or raw email addresses. */
  metadata?: Record<string, string | number | boolean | null>;
  ipAddress?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
};

/** Appends an account-level (venture_id IS NULL) security event, ADR-0008. */
export async function appendAccountAuditEvent(event: AccountAuditEvent): Promise<void> {
  await authPoolDb()
    .insert(auditLog)
    .values({
      ventureId: null,
      actorType: event.actorType,
      actorUserId: event.actorUserId ?? null,
      subjectUserId: event.subjectUserId ?? null,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      outcome: event.outcome,
      metadata: event.metadata ?? {},
      ipAddress: event.ipAddress ?? null,
      userAgent: event.userAgent ?? null,
      correlationId: event.correlationId ?? null,
    });
}

/**
 * Atomically marks a stateless token as consumed. Returns `false` if it was already
 * consumed (replay). Only a hash of the token is ever passed in or stored.
 */
export async function consumeSingleUseToken(input: {
  tokenHash: string;
  purpose: string;
  expiresAt: Date;
}): Promise<boolean> {
  const inserted = await authPoolDb()
    .insert(authConsumedTokens)
    .values(input)
    .onConflictDoNothing()
    .returning({ tokenHash: authConsumedTokens.tokenHash });
  return inserted.length === 1;
}

/**
 * Deletes every outstanding verification value bound to a user (password-reset tokens
 * store the user id as their value). Called after a password reset so older links die.
 */
export async function revokeUserVerificationValues(userId: string): Promise<number> {
  const deleted = await authPoolDb()
    .delete(verifications)
    .where(eq(verifications.value, userId))
    .returning({ id: verifications.id });
  return deleted.length;
}
