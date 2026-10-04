import { appendAccountAuditEvent, type AccountAuditEvent } from "@/platform/db";
import { logger } from "@/platform/observability/logger";
import type { RequestMeta } from "./request-meta";

/** Canonical account-level security event names (ADR-0008). */
export const AuthEvents = {
  userRegistered: "auth.user.registered",
  signupDuplicate: "auth.signup.duplicate_email",
  emailVerified: "auth.email.verified",
  emailVerificationFailed: "auth.email.verification_failed",
  loginSucceeded: "auth.login.succeeded",
  loginFailed: "auth.login.failed",
  loginLocked: "auth.login.locked",
  loginBlocked: "auth.login.blocked",
  logout: "auth.logout",
  sessionCreated: "auth.session.created",
  sessionRevoked: "auth.session.revoked",
  sessionExpired: "auth.session.expired",
  passwordResetRequested: "auth.password_reset.requested",
  passwordResetCompleted: "auth.password_reset.completed",
  passwordResetFailed: "auth.password_reset.failed",
  passwordChanged: "auth.password.changed",
  passwordChangeFailed: "auth.password.change_failed",
  profileUpdated: "auth.profile.updated",
  rateLimited: "auth.rate_limited",
  mfaChallengeIssued: "auth.mfa.challenge_issued",
  mfaVerified: "auth.mfa.verified",
  mfaFailed: "auth.mfa.failed",
  mfaEnrolmentStarted: "auth.mfa.enrolment_started",
  mfaEnabled: "auth.mfa.enabled",
  mfaDisabled: "auth.mfa.disabled",
  mfaRecoveryCodesRegenerated: "auth.mfa.recovery_codes_regenerated",
  mfaChangeFailed: "auth.mfa.change_failed",
} as const;

type AuditInput = Omit<AccountAuditEvent, "ipAddress" | "userAgent" | "correlationId">;

/**
 * Records a security event. Failure to write is logged at error level (alerting) but does
 * not fail the user's request: authentication availability is not coupled to audit
 * storage. Metadata must never include secrets or raw email addresses.
 */
export async function recordAuthEvent(meta: RequestMeta, event: AuditInput): Promise<void> {
  try {
    await appendAccountAuditEvent({
      ...event,
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      correlationId: meta.correlationId ?? null,
    });
  } catch (error) {
    logger.error(
      {
        audit: { action: event.action, outcome: event.outcome },
        err: error instanceof Error ? { name: error.name } : undefined,
        correlationId: meta.correlationId,
      },
      "audit write failed",
    );
  }
}
