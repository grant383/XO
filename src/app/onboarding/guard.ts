import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { CORRELATION_HEADER, getSession } from "@/modules/identity";
import {
  getOnboarding,
  VentureNotFoundError,
  VenturePermissionError,
  VentureStateError,
  type Actor,
  type OnboardingView,
} from "@/modules/ventures";

/** The authenticated actor for this request; redirects to sign-in when there is none. */
export async function requireActor(): Promise<Actor> {
  const h = await headers();
  const session = await getSession(h);
  if (!session) redirect("/auth/login");
  const incoming = h.get(CORRELATION_HEADER);
  return {
    userId: session.userId,
    correlationId: incoming && /^[A-Za-z0-9._-]{8,128}$/.test(incoming) ? incoming : randomUUID(),
  };
}

export type OnboardingPageContext =
  { kind: "ok"; actor: Actor; view: OnboardingView } | { kind: "forbidden" };

/**
 * Loads onboarding for a route `ventureId`. The id is never trusted: the ventures module
 * re-resolves membership and Owner role under RLS. Unknown or inaccessible ventures 404
 * (no enumeration); completed ventures leave onboarding.
 */
export async function loadOnboardingPage(ventureId: string): Promise<OnboardingPageContext> {
  const actor = await requireActor();
  try {
    return { kind: "ok", actor, view: await getOnboarding(actor, ventureId) };
  } catch (error) {
    if (error instanceof VentureNotFoundError) notFound();
    if (error instanceof VenturePermissionError) return { kind: "forbidden" };
    if (error instanceof VentureStateError) redirect("/");
    throw error;
  }
}

export { resumePath, stepPath } from "./routes";
