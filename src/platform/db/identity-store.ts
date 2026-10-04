import { createHash } from "node:crypto";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { authPoolDb } from "./internal/clients";
import {
  accounts,
  auditLog,
  authConsumedTokens,
  sessions,
  twoFactors,
  users,
  verifications,
} from "./schema";

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
    schema: { users, sessions, accounts, verifications, twoFactors },
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

/**
 * TOTP replay protection (RFC 6238 §5.2, ADR-0016): a one-time code is accepted at most
 * once per user. A code stays verifiable for at most three time steps, so a use recorded
 * in the current step blocks it again in this step and the next two. Only a hash of
 * user, code and step is stored. Returns `false` when the code was already presented.
 */
export async function consumeTotpCode(input: {
  userId: string;
  code: string;
  periodSec: number;
  now?: Date;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const step = Math.floor(now.getTime() / 1000 / input.periodSec);
  const hash = (s: number) =>
    createHash("sha256").update(`totp:${input.userId}:${input.code}:${s}`).digest("base64url");
  return authPoolDb().transaction(async (tx) => {
    const earlier = await tx
      .select({ tokenHash: authConsumedTokens.tokenHash })
      .from(authConsumedTokens)
      .where(inArray(authConsumedTokens.tokenHash, [hash(step - 1), hash(step - 2)]));
    if (earlier.length > 0) return false;
    const inserted = await tx
      .insert(authConsumedTokens)
      .values({
        tokenHash: hash(step),
        purpose: "totp",
        expiresAt: new Date(now.getTime() + 3 * input.periodSec * 1000),
      })
      .onConflictDoNothing()
      .returning({ tokenHash: authConsumedTokens.tokenHash });
    return inserted.length === 1;
  });
}

export type StoredSession = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
};

/** A user's unexpired sessions, newest first. Tokens never leave this module. */
export async function listActiveSessions(userId: string): Promise<StoredSession[]> {
  return authPoolDb()
    .select({
      id: sessions.id,
      createdAt: sessions.createdAt,
      updatedAt: sessions.updatedAt,
      expiresAt: sessions.expiresAt,
      ipAddress: sessions.ipAddress,
      userAgent: sessions.userAgent,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.createdAt));
}

/**
 * The token of one of a user's sessions, so it can be revoked through Better Auth (which
 * audits the revocation). Ownership is part of the lookup: another user's id finds nothing.
 */
export async function sessionTokenFor(userId: string, sessionId: string): Promise<string | null> {
  const rows = await authPoolDb()
    .select({ token: sessions.token })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
  return rows[0]?.token ?? null;
}
