/**
 * Post-authentication destinations (e.g. returning to `/invite/[token]` after sign-in or
 * registration). Only same-origin absolute paths built from unreserved URL characters are
 * accepted: no scheme, host, `//`, backslash, `..`, query, fragment or percent-encoding,
 * so a crafted `next` value can never become an open redirect.
 */
const SAFE_PATH = /^\/[A-Za-z0-9\-._~/]{0,511}$/;

export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string" || !SAFE_PATH.test(value)) return null;
  if (value.includes("//") || value.includes("..")) return null;
  return value;
}

/** `/auth/login` (or another auth page) carrying a validated `next` destination. */
export function withNext(
  path: "/auth/login" | "/auth/register" | "/auth/mfa" | "/auth/session-expired",
  next: unknown,
): string {
  const safe = safeNextPath(next);
  return safe ? `${path}?next=${encodeURIComponent(safe)}` : path;
}
