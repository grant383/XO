import { randomUUID } from "node:crypto";
import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CORRELATION_HEADER, getSession, withNext } from "@/modules/identity";
import type { Actor } from "@/modules/ventures";

/**
 * The authenticated actor for this request, re-resolved from the session cookie on every
 * request and action. Without a session it redirects to sign-in, returning to `next`
 * (validated) afterwards.
 */
export async function requireActor(
  next?: string,
): Promise<Actor & { email: string; name: string }> {
  const h = await headers();
  const session = await getSession(h);
  if (!session) redirect((next ? withNext("/auth/login", next) : "/auth/login") as Route);
  const incoming = h.get(CORRELATION_HEADER);
  return {
    userId: session.userId,
    email: session.email,
    name: session.name,
    correlationId: incoming && /^[A-Za-z0-9._-]{8,128}$/.test(incoming) ? incoming : randomUUID(),
  };
}
