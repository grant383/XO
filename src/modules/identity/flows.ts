import { isAPIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { listActiveSessions, schema, sessionTokenFor, withUser } from "@/platform/db";
import { PASSWORD_POLICY } from "./policy";
import { safeNextPath } from "./redirects";
import { getAuth, requireSession } from "./service";

/**
 * Authentication flows used by server actions. Each validates input server-side, calls
 * Better Auth through `auth.api` (so DirectorXO hooks — rate limits, audit, single-use
 * tokens — always run) and maps failures to user-safe, non-enumerating results.
 */
export type FlowResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: FlowErrorCode; message: string; fieldErrors?: Record<string, string> };

export type FlowErrorCode =
  | "VALIDATION"
  | "INVALID_CREDENTIALS"
  | "EMAIL_NOT_VERIFIED"
  | "INVALID_TOKEN"
  | "RATE_LIMITED"
  | "UNAUTHENTICATED"
  | "INVALID_CODE"
  | "MFA_CHALLENGE_EXPIRED"
  | "MFA_LOCKED"
  | "REAUTH_REQUIRED"
  | "UNEXPECTED";

const email = z.string().trim().toLowerCase().pipe(z.email().max(320));
const password = z.string().min(PASSWORD_POLICY.minLength).max(PASSWORD_POLICY.maxLength);
const name = z.string().trim().min(1).max(120);
const token = z.string().min(10).max(2048);

export const registerInput = z.object({ name, email, password });
export const loginInput = z.object({
  email,
  password: z.string().min(1).max(PASSWORD_POLICY.maxLength),
  rememberMe: z.boolean().default(true),
});
export const emailInput = z.object({ email });
export const resetPasswordInput = z.object({ token, newPassword: password });
export const verifyEmailInput = z.object({ token });
export const changePasswordInput = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_POLICY.maxLength),
  newPassword: password,
});
export const updateNameInput = z.object({ name });
/** Six digits; spaces a user types or pastes ("123 456") are ignored. */
const totpCode = z
  .string()
  .transform((v) => v.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^\d{6}$/));
/** Recovery codes are shown as "abcde-fghij"; case and spacing are kept as typed. */
const recoveryCode = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().regex(/^[A-Za-z0-9]{5}-?[A-Za-z0-9]{5}$/));
export const mfaChallengeInput = z.discriminatedUnion("method", [
  z.object({ method: z.literal("totp"), code: totpCode }),
  z.object({ method: z.literal("recovery"), code: recoveryCode }),
]);
export const mfaCodeInput = z.object({ code: totpCode });
export const mfaPasswordInput = z.object({
  password: z.string().min(1).max(PASSWORD_POLICY.maxLength),
});

const MESSAGES: Record<FlowErrorCode, string> = {
  VALIDATION: "Check the highlighted fields and try again.",
  INVALID_CREDENTIALS: "Incorrect email or password.",
  EMAIL_NOT_VERIFIED: "Verify your email address to sign in. We have sent you a new link.",
  INVALID_TOKEN: "This link is invalid, has expired or has already been used. Request a new one.",
  RATE_LIMITED: "Too many attempts. Please wait a few minutes and try again.",
  UNAUTHENTICATED: "Your session has ended. Sign in again.",
  INVALID_CODE: "That code didn’t work. Check it and try again.",
  MFA_CHALLENGE_EXPIRED: "This sign-in attempt has ended. Sign in again to get a new code.",
  MFA_LOCKED: "Too many incorrect codes. Wait 15 minutes, then sign in again.",
  REAUTH_REQUIRED: "For your security, sign in again before making this change.",
  UNEXPECTED: "Something went wrong. Please try again.",
};

const fail = (code: FlowErrorCode, fieldErrors?: Record<string, string>): FlowResult<never> => ({
  ok: false,
  code,
  message: MESSAGES[code],
  ...(fieldErrors ? { fieldErrors } : {}),
});

function validationFailure(error: z.ZodError): FlowResult<never> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (fieldErrors[key]) continue;
    fieldErrors[key] =
      key === "password" || key === "newPassword"
        ? `Use ${PASSWORD_POLICY.minLength}–${PASSWORD_POLICY.maxLength} characters.`
        : key === "email"
          ? "Enter a valid email address."
          : key === "name"
            ? "Enter your name."
            : key === "code"
              ? "Enter the code shown in your authenticator app."
              : key === "password"
                ? "Enter your password."
                : "This value is not valid.";
  }
  return fail("VALIDATION", fieldErrors);
}

/** Maps Better Auth errors to flow codes. Never echoes provider messages to the user. */
function mapError(error: unknown, fallback: FlowErrorCode = "UNEXPECTED"): FlowResult<never> {
  if (!isAPIError(error)) throw error;
  const code = (error.body as { code?: string } | undefined)?.code;
  switch (code) {
    case "RATE_LIMITED":
      return fail("RATE_LIMITED");
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_PASSWORD":
      return fail("INVALID_CREDENTIALS");
    case "EMAIL_NOT_VERIFIED":
      return fail("EMAIL_NOT_VERIFIED");
    case "INVALID_TOKEN":
    case "TOKEN_EXPIRED":
    case "USER_NOT_FOUND":
      return fail("INVALID_TOKEN");
    case "PASSWORD_TOO_SHORT":
    case "PASSWORD_TOO_LONG":
      return fail("VALIDATION", {
        password: `Use ${PASSWORD_POLICY.minLength}–${PASSWORD_POLICY.maxLength} characters.`,
      });
    case "INVALID_EMAIL":
      return fail("VALIDATION", { email: "Enter a valid email address." });
    case "INVALID_CODE":
    case "INVALID_BACKUP_CODE":
      return fail("INVALID_CODE");
    case "INVALID_TWO_FACTOR_COOKIE":
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
      return fail("MFA_CHALLENGE_EXPIRED");
    case "ACCOUNT_TEMPORARILY_LOCKED":
      return fail("MFA_LOCKED");
    case "SESSION_NOT_FRESH":
      return fail("REAUTH_REQUIRED");
    default:
      return error.statusCode === 401 ? fail("UNAUTHENTICATED") : fail(fallback);
  }
}

/**
 * Always reports success for a well-formed request, whether or not the email exists.
 * `next` (validated by `safeNextPath`) is carried through the verification email.
 */
export async function register(
  input: unknown,
  headers: Headers,
  next?: string | null,
): Promise<FlowResult> {
  const parsed = registerInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const callbackURL = safeNextPath(next);
  try {
    await getAuth().api.signUpEmail({
      body: { ...parsed.data, ...(callbackURL ? { callbackURL } : {}) },
      headers,
    });
    return { ok: true, data: undefined };
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Verifies the password. For an account with MFA, no session is created yet: the result
 * says a second factor is required, and a signed, short-lived challenge cookie is set.
 */
export async function login(
  input: unknown,
  headers: Headers,
): Promise<FlowResult<{ mfaRequired: boolean }>> {
  const parsed = loginInput.safeParse(input);
  if (!parsed.success) return fail("INVALID_CREDENTIALS");
  try {
    const result = await getAuth().api.signInEmail({ body: parsed.data, headers });
    const mfaRequired = (result as { twoFactorRedirect?: boolean }).twoFactorRedirect === true;
    return { ok: true, data: { mfaRequired } };
  } catch (error) {
    return mapError(error);
  }
}

export async function logout(headers: Headers): Promise<FlowResult> {
  try {
    await getAuth().api.signOut({ headers });
  } catch (error) {
    if (!isAPIError(error)) throw error;
  }
  return { ok: true, data: undefined };
}

/** Always reports success for a well-formed request (no account enumeration). */
export async function requestPasswordReset(input: unknown, headers: Headers): Promise<FlowResult> {
  const parsed = emailInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  try {
    await getAuth().api.requestPasswordReset({ body: { email: parsed.data.email }, headers });
    return { ok: true, data: undefined };
  } catch (error) {
    return mapError(error);
  }
}

export async function resetPassword(input: unknown, headers: Headers): Promise<FlowResult> {
  const parsed = resetPasswordInput.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.some((i) => i.path[0] === "token")
      ? fail("INVALID_TOKEN")
      : validationFailure(parsed.error);
  }
  try {
    await getAuth().api.resetPassword({ body: parsed.data, headers });
    return { ok: true, data: undefined };
  } catch (error) {
    return mapError(error, "INVALID_TOKEN");
  }
}

export async function verifyEmail(input: unknown, headers: Headers): Promise<FlowResult> {
  const parsed = verifyEmailInput.safeParse(input);
  if (!parsed.success) return fail("INVALID_TOKEN");
  try {
    await getAuth().api.verifyEmail({ query: { token: parsed.data.token }, headers });
    return { ok: true, data: undefined };
  } catch (error) {
    return mapError(error, "INVALID_TOKEN");
  }
}

/** Always reports success for a well-formed request (no account enumeration). */
export async function resendVerificationEmail(
  input: unknown,
  headers: Headers,
): Promise<FlowResult> {
  const parsed = emailInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  try {
    await getAuth().api.sendVerificationEmail({ body: { email: parsed.data.email }, headers });
  } catch (error) {
    const mapped = mapError(error);
    if (!mapped.ok && mapped.code === "RATE_LIMITED") return mapped;
  }
  return { ok: true, data: undefined };
}

/** Changes the password and revokes every other session (this one is re-issued). */
export async function changePassword(input: unknown, headers: Headers): Promise<FlowResult> {
  const parsed = changePasswordInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  try {
    await getAuth().api.changePassword({
      body: { ...parsed.data, revokeOtherSessions: true },
      headers,
    });
    return { ok: true, data: undefined };
  } catch (error) {
    return mapError(error);
  }
}

// ---------------------------------------------------------------------------
// Profile identity foundation
// ---------------------------------------------------------------------------

export type Profile = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
};

/** Reads the signed-in user's profile through the RLS-governed runtime role. */
export async function getProfile(headers: Headers): Promise<Profile> {
  const session = await requireSession(headers);
  const { users } = schema;
  const rows = await withUser({ userId: session.userId }, (tx) =>
    tx
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        emailVerified: users.emailVerified,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, session.userId)),
  );
  const profile = rows[0];
  if (!profile) throw new Error("Profile not visible for the authenticated user");
  return profile;
}

export async function updateName(input: unknown, headers: Headers): Promise<FlowResult> {
  const parsed = updateNameInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  try {
    await getAuth().api.updateUser({ body: { name: parsed.data.name }, headers });
    return { ok: true, data: undefined };
  } catch (error) {
    return mapError(error);
  }
}

export type SessionSummary = {
  id: string;
  current: boolean;
  createdAt: Date;
  /** Last time the session was extended (at most daily, ADR-0009). */
  lastActiveAt: Date;
  expiresAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
};

/**
 * Active sessions for the signed-in user, newest first. Read from the identity store:
 * Better Auth's `/list-sessions` refuses sessions older than the freshness window, and
 * listing your own devices must not depend on having just signed in. Tokens are never
 * returned to callers.
 */
export async function listSessions(headers: Headers): Promise<SessionSummary[]> {
  const current = await requireSession(headers);
  const rows = await listActiveSessions(current.userId);
  return rows.map((s) => ({
    id: s.id,
    current: s.id === current.sessionId,
    createdAt: s.createdAt,
    lastActiveAt: s.updatedAt,
    expiresAt: s.expiresAt,
    userAgent: s.userAgent,
    ipAddress: s.ipAddress,
  }));
}

/** Revokes one of the signed-in user's sessions by id (ownership enforced). */
export async function revokeSession(sessionId: string, headers: Headers): Promise<FlowResult> {
  const current = await requireSession(headers);
  const parsed = z.uuid().safeParse(sessionId);
  const token = parsed.success ? await sessionTokenFor(current.userId, parsed.data) : null;
  if (!token) return fail("VALIDATION", { sessionId: "Session not found." });
  await getAuth().api.revokeSession({ headers, body: { token } });
  return { ok: true, data: undefined };
}

export async function revokeOtherSessions(headers: Headers): Promise<FlowResult> {
  await requireSession(headers);
  await getAuth().api.revokeOtherSessions({ headers });
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Multi-factor authentication (ADR-0016)
// ---------------------------------------------------------------------------

/** Completes a pending sign-in with an authenticator code or a single-use recovery code. */
export async function verifyMfaChallenge(input: unknown, headers: Headers): Promise<FlowResult> {
  const parsed = mfaChallengeInput.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", { code: "Enter a valid code." });
  const auth = getAuth();
  try {
    if (parsed.data.method === "totp") {
      await auth.api.verifyTOTP({ body: { code: parsed.data.code }, headers });
    } else {
      // Stored codes always contain the hyphen (abcde-fghij).
      const raw = parsed.data.code.replace("-", "");
      const code = `${raw.slice(0, 5)}-${raw.slice(5)}`;
      await auth.api.verifyBackupCode({ body: { code }, headers });
    }
    return { ok: true, data: undefined };
  } catch (error) {
    return mapError(error, "INVALID_CODE");
  }
}

export type MfaEnrolment = {
  /** otpauth:// URI for the QR code. Shown once; it cannot be read back later. */
  totpUri: string;
  /** The base32 secret, for typing into an authenticator by hand. */
  manualKey: string;
  recoveryCodes: string[];
};

/**
 * Starts (or restarts) enrolment after re-checking the password. The factor is not
 * active until `confirmMfaEnrolment` receives a valid code.
 */
export async function startMfaEnrolment(
  input: unknown,
  headers: Headers,
): Promise<FlowResult<MfaEnrolment>> {
  const parsed = mfaPasswordInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const session = await requireSession(headers);
  if (session.twoFactorEnabled) return fail("VALIDATION", { form: "MFA is already on." });
  try {
    const result = await getAuth().api.enableTwoFactor({
      body: { password: parsed.data.password, method: "totp" },
      headers,
    });
    const totpUri = (result as { totpURI?: string }).totpURI;
    const recoveryCodes = (result as { backupCodes?: string[] }).backupCodes ?? [];
    const manualKey = totpUri ? new URL(totpUri).searchParams.get("secret") : null;
    if (!totpUri || !manualKey) return fail("UNEXPECTED");
    return { ok: true, data: { totpUri, manualKey, recoveryCodes } };
  } catch (error) {
    return mapError(error);
  }
}

/** Confirms enrolment with a first valid code. Other sessions are signed out. */
export async function confirmMfaEnrolment(input: unknown, headers: Headers): Promise<FlowResult> {
  const parsed = mfaCodeInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  await requireSession(headers);
  try {
    await getAuth().api.verifyTOTP({ body: { code: parsed.data.code }, headers });
    return { ok: true, data: undefined };
  } catch (error) {
    return mapError(error, "INVALID_CODE");
  }
}

/** Turns MFA off. Requires the password and a sign-in within the freshness window. */
export async function disableMfa(input: unknown, headers: Headers): Promise<FlowResult> {
  const parsed = mfaPasswordInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  await requireSession(headers);
  try {
    await getAuth().api.disableTwoFactor({ body: { password: parsed.data.password }, headers });
    return { ok: true, data: undefined };
  } catch (error) {
    return mapError(error);
  }
}

/** Replaces every recovery code. The new codes are returned once and never stored plain. */
export async function regenerateRecoveryCodes(
  input: unknown,
  headers: Headers,
): Promise<FlowResult<{ recoveryCodes: string[] }>> {
  const parsed = mfaPasswordInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  await requireSession(headers);
  try {
    const result = await getAuth().api.generateBackupCodes({
      body: { password: parsed.data.password },
      headers,
    });
    return { ok: true, data: { recoveryCodes: result.backupCodes } };
  } catch (error) {
    return mapError(error);
  }
}

export type MfaStatus = { enabled: boolean; recoveryCodesRemaining: number | null };

/** MFA state for the signed-in user. Codes are counted server-side, never returned. */
export async function getMfaStatus(headers: Headers): Promise<MfaStatus> {
  const session = await requireSession(headers);
  if (!session.twoFactorEnabled) return { enabled: false, recoveryCodesRemaining: null };
  try {
    const result = await getAuth().api.viewBackupCodes({ body: { userId: session.userId } });
    return { enabled: true, recoveryCodesRemaining: result.backupCodes.length };
  } catch (error) {
    if (!isAPIError(error)) throw error;
    return { enabled: true, recoveryCodesRemaining: null };
  }
}

/**
 * Whether this browser holds a pending sign-in challenge cookie. Presence only: the
 * challenge itself is validated (signature, expiry, attempts) when a code is submitted.
 */
export async function hasMfaChallenge(headers: Headers): Promise<boolean> {
  const context = await getAuth().$context;
  const name = context.createAuthCookie("two_factor").name;
  const cookies = headers.get("cookie") ?? "";
  return cookies.split(";").some((c) => c.trim().startsWith(`${name}=`));
}
