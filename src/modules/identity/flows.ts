import { isAPIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { schema, withUser } from "@/platform/db";
import { PASSWORD_POLICY } from "./policy";
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

const MESSAGES: Record<FlowErrorCode, string> = {
  VALIDATION: "Check the highlighted fields and try again.",
  INVALID_CREDENTIALS: "Incorrect email or password.",
  EMAIL_NOT_VERIFIED: "Verify your email address to sign in. We have sent you a new link.",
  INVALID_TOKEN: "This link is invalid, has expired or has already been used. Request a new one.",
  RATE_LIMITED: "Too many attempts. Please wait a few minutes and try again.",
  UNAUTHENTICATED: "Your session has ended. Sign in again.",
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
    default:
      return error.statusCode === 401 ? fail("UNAUTHENTICATED") : fail(fallback);
  }
}

/** Always reports success for a well-formed request, whether or not the email exists. */
export async function register(input: unknown, headers: Headers): Promise<FlowResult> {
  const parsed = registerInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  try {
    await getAuth().api.signUpEmail({ body: parsed.data, headers });
    return { ok: true, data: undefined };
  } catch (error) {
    return mapError(error);
  }
}

export async function login(input: unknown, headers: Headers): Promise<FlowResult> {
  const parsed = loginInput.safeParse(input);
  if (!parsed.success) return fail("INVALID_CREDENTIALS");
  try {
    await getAuth().api.signInEmail({ body: parsed.data, headers });
    return { ok: true, data: undefined };
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
  expiresAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
};

/** Active sessions for the signed-in user. Tokens are never returned to callers. */
export async function listSessions(headers: Headers): Promise<SessionSummary[]> {
  const current = await requireSession(headers);
  const sessions = await getAuth().api.listSessions({ headers });
  return sessions.map((s) => ({
    id: s.id,
    current: s.id === current.sessionId,
    createdAt: new Date(s.createdAt),
    expiresAt: new Date(s.expiresAt),
    userAgent: s.userAgent ?? null,
    ipAddress: s.ipAddress ?? null,
  }));
}

/** Revokes one of the signed-in user's sessions by id (ownership enforced). */
export async function revokeSession(sessionId: string, headers: Headers): Promise<FlowResult> {
  await requireSession(headers);
  const auth = getAuth();
  const sessions = await auth.api.listSessions({ headers });
  const target = sessions.find((s) => s.id === sessionId);
  if (!target) return fail("VALIDATION", { sessionId: "Session not found." });
  await auth.api.revokeSession({ headers, body: { token: target.token } });
  return { ok: true, data: undefined };
}

export async function revokeOtherSessions(headers: Headers): Promise<FlowResult> {
  await requireSession(headers);
  await getAuth().api.revokeOtherSessions({ headers });
  return { ok: true, data: undefined };
}
