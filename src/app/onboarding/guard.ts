import { notFound, redirect } from "next/navigation";
import {
  getOnboarding,
  VentureNotFoundError,
  VenturePermissionError,
  VentureStateError,
  type Actor,
  type OnboardingView,
} from "@/modules/ventures";
import { requireActor } from "../actor";

export type OnboardingPageContext =
  { kind: "ok"; actor: Actor; view: OnboardingView } | { kind: "forbidden" };

/**
 * Loads onboarding for a route `ventureId`. The id is never trusted: the ventures module
 * re-resolves membership and Owner role under RLS. Unknown or inaccessible ventures 404
 * (no enumeration); completed ventures leave onboarding.
 */
export async function loadOnboardingPage(ventureId: string): Promise<OnboardingPageContext> {
  const actor = await requireActor(`/onboarding/${ventureId}`);
  try {
    return { kind: "ok", actor, view: await getOnboarding(actor, ventureId) };
  } catch (error) {
    if (error instanceof VentureNotFoundError) notFound();
    if (error instanceof VenturePermissionError) return { kind: "forbidden" };
    if (error instanceof VentureStateError) redirect("/");
    throw error;
  }
}

export { requireActor };
export { resumePath, stepPath } from "./routes";
