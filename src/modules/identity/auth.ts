import { createHash } from "node:crypto";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { verifyJWT } from "better-auth/crypto";
import { nextCookies } from "better-auth/next-js";
import {
  consumeSingleUseToken,
  identityStoreAdapter,
  revokeUserVerificationValues,
} from "@/platform/db";
import { sendEmail } from "@/platform/email";
import { logger } from "@/platform/observability/logger";
import {
  subjectKey,
  type RateLimitDecision,
  type RateLimitRule,
  type RateLimitStore,
} from "@/platform/security";
import { AuthEvents, recordAuthEvent } from "./audit";
import { runInBackground } from "./background";
import {
  existingAccountEmail,
  passwordChangedEmail,
  passwordResetEmail,
  resetPasswordUrl,
  verificationEmail,
  verifyEmailUrl,
} from "./emails";
import { scrubText, scrubValue } from "./log-scrub";
import {
  AUTH_BASE_PATH,
  COOKIE_PREFIX,
  DEFAULT_RATE_LIMIT,
  DISABLED_PATHS,
  LOGIN_FAILURE_LIMIT,
  PASSWORD_POLICY,
  RATE_LIMITS,
  SESSION_POLICY,
  TOKEN_POLICY,
} from "./policy";
import { requestMeta, type RequestMeta } from "./request-meta";

export type IdentityConfig = {
  appUrl: string;
  secret: string;
  /** Adds `Secure` and the `__Secure-` cookie prefix. Always true in production. */
  secureCookies: boolean;
  rateLimitStore: RateLimitStore;
};

/** Removes `token` properties (session tokens) up to two levels deep. */
function withoutTokens(value: unknown, depth = 0): { value: unknown; changed: boolean } {
  if (depth > 2 || value === null || typeof value !== "object") return { value, changed: false };
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) {
    return { value, changed: false }; // Dates and other class instances pass through
  }
  if (Array.isArray(value)) {
    const items = value.map((v) => withoutTokens(v, depth + 1));
    return { value: items.map((i) => i.value), changed: items.some((i) => i.changed) };
  }
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (key === "token") {
      changed = changed || v !== null;
      out[key] = null;
      continue;
    }
    const inner = withoutTokens(v, depth + 1);
    changed = changed || inner.changed;
    out[key] = inner.value;
  }
  return { value: out, changed };
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("base64url");

/** Generic 429. Identical for existing and unknown accounts. */
function tooManyRequests(retryAfterSec: number) {
  return new APIError(
    "TOO_MANY_REQUESTS",
    { code: "RATE_LIMITED", message: "Too many attempts. Please wait and try again." },
    { "Retry-After": String(Math.max(retryAfterSec, 1)) },
  );
}

function errorCode(returned: unknown): string | undefined {
  if (!isAPIError(returned)) return undefined;
  const code = (returned.body as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? code : String(returned.status);
}

export function createIdentityAuth(config: IdentityConfig) {
  const { appUrl, secret, rateLimitStore } = config;

  /**
   * Rate-limit storage failures fail open (logged at error level and surfaced by the
   * readiness probe): an outage of Redis must not lock every user out.
   */
  async function limit(
    op: "consume" | "peek",
    key: string,
    rule: RateLimitRule,
  ): Promise<RateLimitDecision> {
    try {
      return await rateLimitStore[op](key, rule);
    } catch (error) {
      logger.error(
        { err: scrubValue(error), rateLimit: { key: key.split(":")[0] } },
        "rate limiter unavailable",
      );
      return { allowed: true, count: 0, retryAfterSec: 0 };
    }
  }

  const emailOf = (body: unknown) => {
    const email = (body as { email?: unknown } | undefined)?.email;
    return typeof email === "string" && email.length <= 320 ? email : undefined;
  };

  let warnedMissingIp = false;

  async function enforceRateLimits(
    path: string,
    body: unknown,
    meta: RequestMeta,
    viaHttp: boolean,
  ) {
    // Explicit rules cover sensitive endpoints on every path (HTTP and server actions).
    // The catch-all rule applies to browser HTTP traffic only, so trusted server-side
    // session reads during page rendering are not throttled per client.
    const rules = RATE_LIMITS[path] ?? (viaHttp ? { ip: DEFAULT_RATE_LIMIT } : undefined);
    if (!rules) return;

    // Without a trustworthy client IP, a shared "unknown" bucket would let one attacker
    // lock out every user, so per-IP limiting is skipped (per-account limits still apply).
    if (!meta.ip && !warnedMissingIp) {
      warnedMissingIp = true;
      logger.warn({ path }, "client IP unavailable; per-IP auth rate limits skipped");
    }
    const ipDecision = meta.ip
      ? await limit("consume", `ip:${path}:${meta.ip}`, rules.ip)
      : { allowed: true, count: 0, retryAfterSec: 0 };
    if (!ipDecision.allowed) {
      // Audit only the first rejection per window to avoid flooding the audit log.
      if (ipDecision.count === rules.ip.max + 1) {
        await recordAuthEvent(meta, {
          action: AuthEvents.rateLimited,
          outcome: "denied",
          actorType: "anonymous",
          metadata: { path, scope: "ip" },
        });
      }
      throw tooManyRequests(ipDecision.retryAfterSec);
    }

    const email = emailOf(body);
    if (!email) return;
    const subject = subjectKey(email, secret);

    if (path === "/sign-in/email") {
      const lock = await limit("peek", `login-fail:${subject}`, LOGIN_FAILURE_LIMIT);
      if (!lock.allowed) {
        await recordAuthEvent(meta, {
          action: AuthEvents.loginBlocked,
          outcome: "denied",
          actorType: "anonymous",
          metadata: { reason: "account_locked", accountKey: subject },
        });
        throw tooManyRequests(lock.retryAfterSec);
      }
    } else if (rules.account) {
      const decision = await limit("consume", `acct:${path}:${subject}`, rules.account);
      if (!decision.allowed) throw tooManyRequests(decision.retryAfterSec);
    }
  }

  /**
   * Better Auth email-verification tokens are stateless JWTs. Record each one on first
   * use so a replayed link is rejected (single-use requirement). Expired and invalid
   * tokens are left for Better Auth to reject.
   */
  async function enforceSingleUseVerification(query: unknown, meta: RequestMeta) {
    const token = (query as { token?: unknown } | undefined)?.token;
    if (typeof token !== "string") return;
    const payload = await verifyJWT(token, secret);
    if (!payload || typeof payload.exp !== "number") return;
    const fresh = await consumeSingleUseToken({
      tokenHash: sha256(token),
      purpose: "email-verification",
      expiresAt: new Date(payload.exp * 1000),
    });
    if (!fresh) {
      await recordAuthEvent(meta, {
        action: AuthEvents.emailVerificationFailed,
        outcome: "failure",
        actorType: "anonymous",
        metadata: { reason: "TOKEN_ALREADY_USED" },
      });
      throw new APIError("UNAUTHORIZED", { code: "INVALID_TOKEN", message: "Invalid token" });
    }
  }

  const beforeHook = createAuthMiddleware(async (ctx) => {
    const meta = requestMeta(ctx);
    await enforceRateLimits(ctx.path, ctx.body, meta, ctx.request !== undefined);

    if (ctx.path === "/update-user") {
      // Profile identity foundation: display name only. Image URLs and any other
      // user fields are not user-editable through the identity API.
      const keys = Object.keys((ctx.body as object | undefined) ?? {});
      if (keys.length === 0 || keys.some((k) => k !== "name")) {
        throw new APIError("BAD_REQUEST", {
          code: "INVALID_FIELDS",
          message: "Only name can be updated",
        });
      }
      const name = (ctx.body as { name?: unknown }).name;
      if (typeof name !== "string" || name.trim().length < 1 || name.length > 120) {
        throw new APIError("BAD_REQUEST", {
          code: "INVALID_NAME",
          message: "Name must be 1–120 characters",
        });
      }
    }

    if (ctx.path === "/sign-up/email") {
      const name = (ctx.body as { name?: unknown } | undefined)?.name;
      if (typeof name !== "string" || name.trim().length < 1 || name.length > 120) {
        throw new APIError("BAD_REQUEST", {
          code: "INVALID_NAME",
          message: "Name must be 1–120 characters",
        });
      }
      const extra = Object.keys((ctx.body as object | undefined) ?? {}).filter(
        (k) => !["name", "email", "password", "callbackURL", "rememberMe"].includes(k),
      );
      if (extra.length > 0) {
        throw new APIError("BAD_REQUEST", { code: "INVALID_FIELDS", message: "Unexpected fields" });
      }
    }

    if (ctx.path === "/verify-email") await enforceSingleUseVerification(ctx.query, meta);
  });

  const afterHook = createAuthMiddleware(async (ctx) => {
    const meta = requestMeta(ctx);
    const returned = ctx.context.returned;
    const failed = isAPIError(returned);
    const code = errorCode(returned);

    switch (ctx.path) {
      case "/sign-in/email": {
        const email = emailOf(ctx.body);
        if (!email) break;
        const subject = subjectKey(email, secret);
        if (!failed) {
          await rateLimitStore.reset(`login-fail:${subject}`).catch(() => undefined);
          break;
        }
        if (code === "INVALID_EMAIL_OR_PASSWORD") {
          const attempt = await limit("consume", `login-fail:${subject}`, LOGIN_FAILURE_LIMIT);
          await recordAuthEvent(meta, {
            action: AuthEvents.loginFailed,
            outcome: "failure",
            actorType: "anonymous",
            metadata: {
              reason: "invalid_credentials",
              accountKey: subject,
              attempt: attempt.count,
            },
          });
          if (attempt.count === LOGIN_FAILURE_LIMIT.max) {
            await recordAuthEvent(meta, {
              action: AuthEvents.loginLocked,
              outcome: "denied",
              actorType: "anonymous",
              metadata: { accountKey: subject, lockSeconds: attempt.retryAfterSec },
            });
          }
        } else if (code === "EMAIL_NOT_VERIFIED") {
          await recordAuthEvent(meta, {
            action: AuthEvents.loginFailed,
            outcome: "denied",
            actorType: "anonymous",
            metadata: { reason: "email_not_verified", accountKey: subject },
          });
        }
        break;
      }
      case "/verify-email":
        if (failed) {
          await recordAuthEvent(meta, {
            action: AuthEvents.emailVerificationFailed,
            outcome: "failure",
            actorType: "anonymous",
            metadata: { reason: code ?? "unknown" },
          });
        }
        break;
      case "/reset-password":
        if (failed) {
          await recordAuthEvent(meta, {
            action: AuthEvents.passwordResetFailed,
            outcome: "failure",
            actorType: "anonymous",
            metadata: { reason: code ?? "unknown" },
          });
        }
        break;
      case "/change-password": {
        const user = ctx.context.session?.user;
        if (!user) break;
        await recordAuthEvent(meta, {
          action: failed ? AuthEvents.passwordChangeFailed : AuthEvents.passwordChanged,
          outcome: failed ? "failure" : "success",
          actorType: "user",
          actorUserId: user.id,
          subjectUserId: user.id,
          metadata: failed ? { reason: code ?? "unknown" } : {},
        });
        if (!failed) {
          runInBackground(sendEmail(passwordChangedEmail(user, `${appUrl}/auth/forgot-password`)));
        }
        break;
      }
      case "/update-user": {
        const user = ctx.context.session?.user;
        if (!user || failed) break;
        await recordAuthEvent(meta, {
          action: AuthEvents.profileUpdated,
          outcome: "success",
          actorType: "user",
          actorUserId: user.id,
          subjectUserId: user.id,
          metadata: { fields: "name" },
        });
        break;
      }
    }

    // The session is carried only by the signed HttpOnly cookie. Session tokens are
    // removed from every browser-facing JSON body (sign-in, change-password, get-session,
    // list-sessions, ...) so scripts never see them. Server-side `auth.api` calls (no
    // HTTP request) keep them for trusted server code.
    if (
      ctx.request &&
      !failed &&
      returned &&
      typeof returned === "object" &&
      !(returned instanceof Response)
    ) {
      const { value, changed } = withoutTokens(returned);
      if (changed) return ctx.json(value as Record<string, unknown>);
    }
  });

  return betterAuth({
    appName: "DirectorXO",
    baseURL: appUrl,
    basePath: AUTH_BASE_PATH,
    secret,
    trustedOrigins: [appUrl],
    database: identityStoreAdapter(),
    telemetry: { enabled: false },
    disabledPaths: DISABLED_PATHS,

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: PASSWORD_POLICY.minLength,
      maxPasswordLength: PASSWORD_POLICY.maxLength,
      resetPasswordTokenExpiresIn: TOKEN_POLICY.passwordResetTtlSec,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }, request) => {
        await recordAuthEvent(requestMeta({ request }), {
          action: AuthEvents.passwordResetRequested,
          outcome: "success",
          actorType: "anonymous",
          subjectUserId: user.id,
        });
        await sendEmail(
          passwordResetEmail(
            user,
            resetPasswordUrl(appUrl, token),
            TOKEN_POLICY.passwordResetTtlSec / 60,
          ),
        );
      },
      onPasswordReset: async ({ user }, request) => {
        // Any other outstanding reset links for this user die with this reset.
        await revokeUserVerificationValues(user.id);
        await recordAuthEvent(requestMeta({ request }), {
          action: AuthEvents.passwordResetCompleted,
          outcome: "success",
          actorType: "anonymous",
          subjectUserId: user.id,
          metadata: { sessionsRevoked: true },
        });
      },
      onExistingUserSignUp: async ({ user }, request) => {
        await recordAuthEvent(requestMeta({ request }), {
          action: AuthEvents.signupDuplicate,
          outcome: "denied",
          actorType: "anonymous",
          subjectUserId: user.id,
        });
        await sendEmail(
          existingAccountEmail(user, `${appUrl}/auth/login`, `${appUrl}/auth/forgot-password`),
        );
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      expiresIn: TOKEN_POLICY.emailVerificationTtlSec,
      sendVerificationEmail: async ({ user, token }) => {
        await sendEmail(
          verificationEmail(
            user,
            verifyEmailUrl(appUrl, token),
            TOKEN_POLICY.emailVerificationTtlSec / 3600,
          ),
        );
      },
      afterEmailVerification: async (user, request) => {
        await recordAuthEvent(requestMeta({ request }), {
          action: AuthEvents.emailVerified,
          outcome: "success",
          actorType: "user",
          actorUserId: user.id,
          subjectUserId: user.id,
        });
      },
    },

    session: {
      expiresIn: SESSION_POLICY.idleTimeoutSec,
      updateAge: SESSION_POLICY.refreshIntervalSec,
      freshAge: SESSION_POLICY.freshAgeSec,
      // No cookie cache: every request is checked against the sessions table, so
      // revocation takes effect immediately.
      cookieCache: { enabled: false },
    },

    // Verification identifiers (password-reset tokens) are stored as hashes.
    verification: { storeIdentifier: "hashed" },

    // DirectorXO enforces its own limits in `beforeHook`, which (unlike the built-in
    // limiter) also covers server actions calling `auth.api` directly.
    rateLimit: { enabled: false },

    advanced: {
      // Explicit: Better Auth disables Origin/CSRF validation by default when
      // NODE_ENV=test. A misconfigured environment must never switch CSRF checks off.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      cookiePrefix: COOKIE_PREFIX,
      useSecureCookies: config.secureCookies,
      defaultCookieAttributes: {
        httpOnly: true,
        // Lax: sent on top-level navigation (links from email) but not on cross-site
        // subresource or POST requests. Better Auth additionally validates Origin.
        sameSite: "lax",
        secure: config.secureCookies,
        path: "/",
      },
      database: { generateId: "uuid" },
      backgroundTasks: { handler: runInBackground },
      ipAddress: { ipAddressHeaders: [process.env.CLIENT_IP_HEADER ?? "x-forwarded-for"] },
    },

    databaseHooks: {
      user: {
        create: {
          after: async (user, ctx) => {
            await recordAuthEvent(requestMeta(ctx), {
              action: AuthEvents.userRegistered,
              outcome: "success",
              actorType: "user",
              actorUserId: user.id,
              subjectUserId: user.id,
            });
          },
        },
      },
      session: {
        create: {
          after: async (session, ctx) => {
            const login = ctx?.path === "/sign-in/email";
            await recordAuthEvent(requestMeta(ctx), {
              action: login ? AuthEvents.loginSucceeded : AuthEvents.sessionCreated,
              outcome: "success",
              actorType: "user",
              actorUserId: session.userId,
              subjectUserId: session.userId,
              targetType: "session",
              targetId: session.id,
              metadata: login ? {} : { path: ctx?.path ?? "internal" },
            });
          },
        },
        update: {
          // Absolute lifetime: sliding refresh can never extend a session beyond
          // createdAt + absoluteLifetime.
          before: async (data, ctx) => {
            const createdAt = ctx?.context.session?.session.createdAt;
            if (!data.expiresAt || !createdAt) return;
            const cap = new Date(
              new Date(createdAt).getTime() + SESSION_POLICY.absoluteLifetimeSec * 1000,
            );
            if (new Date(data.expiresAt) > cap) return { data: { ...data, expiresAt: cap } };
          },
        },
        delete: {
          after: async (session, ctx) => {
            const path = ctx?.path;
            // Sign-out is authorised by the session's own signed cookie, so its owner is
            // the actor even though Better Auth does not load the session into context.
            const actor = path === "/sign-out" ? session.userId : ctx?.context.session?.user.id;
            const action =
              path === "/sign-out"
                ? AuthEvents.logout
                : path === "/get-session"
                  ? AuthEvents.sessionExpired
                  : AuthEvents.sessionRevoked;
            const reason =
              path === "/reset-password"
                ? "password_reset"
                : path === "/change-password"
                  ? "password_change"
                  : path?.startsWith("/revoke")
                    ? "user_request"
                    : (path ?? "internal");
            await recordAuthEvent(requestMeta(ctx), {
              action,
              outcome: "success",
              actorType: actor ? "user" : "system",
              actorUserId: actor ?? null,
              subjectUserId: session.userId,
              targetType: "session",
              targetId: session.id,
              metadata: action === AuthEvents.sessionRevoked ? { reason } : {},
            });
          },
        },
      },
    },

    hooks: { before: beforeHook, after: afterHook },

    logger: {
      level: process.env.NODE_ENV === "production" ? "warn" : "info",
      log: (level, message, ...args) => {
        const payload = {
          component: "better-auth",
          args: args.length ? scrubValue(args) : undefined,
        };
        const text = scrubText(message);
        if (level === "error") logger.error(payload, text);
        else if (level === "warn") logger.warn(payload, text);
        else if (level === "debug") logger.debug(payload, text);
        else logger.info(payload, text);
      },
    },

    // Must remain last: forwards Set-Cookie from `auth.api` calls in server actions.
    plugins: [nextCookies()],
  });
}

export type IdentityAuth = ReturnType<typeof createIdentityAuth>;
