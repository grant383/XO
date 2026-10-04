import { authEnv } from "@/platform/config/env";
import { RedisRateLimitStore } from "@/platform/security";
import { redis } from "@/platform/redis";
import { createIdentityAuth, type IdentityAuth } from "./auth";
import { SESSION_POLICY } from "./policy";

let instance: IdentityAuth | undefined;

/** The application's Better Auth instance (created on first use, so builds need no secrets). */
export function getAuth(): IdentityAuth {
  if (!instance) {
    const env = authEnv();
    instance = createIdentityAuth({
      appUrl: env.APP_URL,
      secret: env.AUTH_SECRET,
      secureCookies: env.NODE_ENV === "production" || env.APP_URL.startsWith("https://"),
      rateLimitStore: new RedisRateLimitStore(redis()),
    });
  }
  return instance;
}

/** Test seam: replaces the instance (e.g. with an in-memory rate-limit store). */
export function setAuthForTests(next: IdentityAuth | undefined) {
  instance = next;
}

/** The authenticated identity for a request. Venture membership is resolved separately. */
export type AuthenticatedSession = {
  userId: string;
  sessionId: string;
  email: string;
  name: string;
  emailVerified: boolean;
  /** TOTP multi-factor authentication is enrolled and confirmed (ADR-0016). */
  twoFactorEnabled: boolean;
  createdAt: Date;
  expiresAt: Date;
};

/**
 * Resolves and validates the session for a request from its HttpOnly cookie. This is the
 * single server-side entry point for authentication: route handlers, server components
 * and server actions must use it rather than reading cookies directly.
 */
export async function getSession(headers: Headers): Promise<AuthenticatedSession | null> {
  const auth = getAuth();
  const result = await auth.api.getSession({ headers });
  if (!result) return null;
  const { session, user } = result;

  // Defence in depth: the refresh hook caps expiry at the absolute lifetime, and this
  // check also covers sessions that are never refreshed.
  const absoluteEnd =
    new Date(session.createdAt).getTime() + SESSION_POLICY.absoluteLifetimeSec * 1000;
  if (Date.now() >= absoluteEnd) {
    await auth.api.signOut({ headers }).catch(() => undefined);
    return null;
  }
  if (!user.emailVerified) return null;

  return {
    userId: user.id,
    sessionId: session.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
    twoFactorEnabled: user.twoFactorEnabled === true,
    createdAt: new Date(session.createdAt),
    expiresAt: new Date(session.expiresAt),
  };
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "UnauthenticatedError";
  }
}

/** Like `getSession`, but throws `UnauthenticatedError` when there is no valid session. */
export async function requireSession(headers: Headers): Promise<AuthenticatedSession> {
  const session = await getSession(headers);
  if (!session) throw new UnauthenticatedError();
  return session;
}
