import type { RateLimitRule } from "@/platform/security";

/**
 * Authentication policy (ADR-0009). Changing any value here is a security decision:
 * record it in the ADR.
 */
export const AUTH_BASE_PATH = "/api/v1/auth";
export const COOKIE_PREFIX = "dxo";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const SESSION_POLICY = {
  /** Sliding (idle) lifetime: a session unused for this long expires. */
  idleTimeoutSec: 7 * DAY,
  /** How often an active session's expiry is extended (one write per day at most). */
  refreshIntervalSec: DAY,
  /** Hard cap from sign-in regardless of activity; re-authentication is then required. */
  absoluteLifetimeSec: 30 * DAY,
  /** Sensitive operations (e.g. future MFA changes) require a sign-in this recent. */
  freshAgeSec: 15 * MINUTE,
} as const;

export const PASSWORD_POLICY = { minLength: 12, maxLength: 128 } as const;

export const TOKEN_POLICY = {
  emailVerificationTtlSec: 24 * HOUR,
  passwordResetTtlSec: 30 * MINUTE,
} as const;

type PathLimits = {
  /** Per client IP and path. */
  ip: RateLimitRule;
  /** Per target account (keyed by HMAC of the submitted email), regardless of existence. */
  account?: RateLimitRule;
};

/**
 * Rate limits applied in a Better Auth `before` hook, so they cover both the HTTP API and
 * server actions that call `auth.api` directly.
 */
export const RATE_LIMITS: Record<string, PathLimits> = {
  "/sign-in/email": { ip: { windowSec: 5 * MINUTE, max: 20 } },
  "/sign-up/email": {
    ip: { windowSec: HOUR, max: 10 },
    account: { windowSec: HOUR, max: 3 },
  },
  "/request-password-reset": {
    ip: { windowSec: 15 * MINUTE, max: 10 },
    account: { windowSec: HOUR, max: 3 },
  },
  "/send-verification-email": {
    ip: { windowSec: 15 * MINUTE, max: 10 },
    account: { windowSec: HOUR, max: 3 },
  },
  "/reset-password": { ip: { windowSec: 15 * MINUTE, max: 10 } },
  "/verify-email": { ip: { windowSec: 15 * MINUTE, max: 20 } },
  "/change-password": { ip: { windowSec: 15 * MINUTE, max: 10 } },
};
export const DEFAULT_RATE_LIMIT: RateLimitRule = { windowSec: MINUTE, max: 120 };

/**
 * Credential-stuffing / brute-force protection: failed sign-ins per account. Once
 * exceeded, sign-in for that account is refused (even with the right password) until the
 * window ends. The response is identical whether or not the account exists.
 */
export const LOGIN_FAILURE_LIMIT: RateLimitRule = { windowSec: 15 * MINUTE, max: 5 };

/** Endpoints not used by DirectorXO. Disabled to minimise attack surface. */
export const DISABLED_PATHS = [
  "/sign-in/social",
  "/callback/:id",
  "/link-social",
  "/unlink-account",
  "/list-accounts",
  "/account-info",
  "/refresh-token",
  "/get-access-token",
  "/change-email",
  "/delete-user",
  "/delete-user/callback",
  "/update-session",
  "/verify-password",
  // Email links open DirectorXO pages that POST the token; the GET redirect is unused.
  "/reset-password/:token",
];
