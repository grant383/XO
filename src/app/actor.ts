import { randomUUID } from "node:crypto";
import type { Route } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { CORRELATION_HEADER, getSession, hasSessionCookie, withNext } from "@/modules/identity";
import type { Actor } from "@/modules/ventures";

/**
 * Request headers for identity reads, with the Cookie header rebuilt from `cookies()`.
 * When a server action rotates the session cookie (password change, MFA on/off), Next.js
 * re-renders the route in the same response and syncs `cookies()` with the new value, but
 * not `headers()`. Reading the session from raw headers there would see the revoked
 * session and send the user to /auth/session-expired.
 */
export async function identityHeaders(): Promise<Headers> {
  const h = new Headers(await headers());
  const jar = (await cookies()).getAll();
  if (jar.length === 0) h.delete("cookie");
  else h.set("cookie", jar.map((c) => `${c.name}=${encodeURIComponent(c.value)}`).join("; "));
  return h;
}

/**
 * Where a request without a valid session goes: `/auth/session-expired` when its session
 * cookie outlived the session (idle or absolute expiry, or revocation), otherwise
 * `/auth/login`. Either way a validated `next` survives sign-in.
 */
export async function signInPath(h: Headers, next?: string): Promise<Route> {
  const target = (await hasSessionCookie(h)) ? "/auth/session-expired" : "/auth/login";
  return (next ? withNext(target, next) : target) as Route;
}

/**
 * The authenticated actor for this request, re-resolved from the session cookie on every
 * request and action. Without a session it redirects to sign-in, returning to `next`
 * (validated) afterwards.
 */
export async function requireActor(
  next?: string,
): Promise<Actor & { email: string; name: string }> {
  const h = await identityHeaders();
  const session = await getSession(h);
  if (!session) redirect(await signInPath(h, next));
  const incoming = h.get(CORRELATION_HEADER);
  return {
    userId: session.userId,
    email: session.email,
    name: session.name,
    correlationId: incoming && /^[A-Za-z0-9._-]{8,128}$/.test(incoming) ? incoming : randomUUID(),
  };
}
