"use server";

import { redirect } from "next/navigation";
import {
  completeDataConnections,
  completeOnboarding,
  createDraftVenture,
  lookupCompany,
  saveBusinessDetails,
  VentureNotFoundError,
  VenturePermissionError,
  VentureStateError,
  type CompanyLookupResult,
} from "@/modules/ventures";
import type { OnboardingFormState } from "./form-state";
import { requireActor, stepPath } from "./guard";

/**
 * Every action is an untrusted entry point: it re-authenticates, and the ventures module
 * re-authorises (active Owner of a draft venture) inside RLS-scoped transactions. The
 * venture id arrives from the client and is only a reference.
 */
const text = (data: FormData, name: string) => {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
};

function accessFailure(error: unknown): OnboardingFormState {
  if (error instanceof VentureNotFoundError) {
    return { status: "error", message: "This venture could not be found." };
  }
  if (error instanceof VenturePermissionError) {
    return { status: "error", message: "Only the venture Owner can complete onboarding." };
  }
  if (error instanceof VentureStateError) redirect("/");
  throw error;
}

export async function createVentureAction(
  _prev: OnboardingFormState,
  data: FormData,
): Promise<OnboardingFormState> {
  const actor = await requireActor();
  const result = await createDraftVenture(actor, {
    name: text(data, "name"),
    requestId: text(data, "requestId"),
  });
  if (!result.ok) {
    return {
      status: "error",
      message: result.message,
      fieldErrors: result.fieldErrors,
      values: { name: text(data, "name") },
    };
  }
  redirect(stepPath(result.data.ventureId, "business"));
}

const BUSINESS_FIELDS = [
  "name",
  "legalName",
  "companyNumber",
  "sector",
  "reportingCurrency",
  "timezone",
  "fiscalYearStartMonth",
] as const;

export async function saveBusinessAction(
  ventureId: string,
  _prev: OnboardingFormState,
  data: FormData,
): Promise<OnboardingFormState> {
  const actor = await requireActor();
  const values = Object.fromEntries(BUSINESS_FIELDS.map((f) => [f, text(data, f)]));
  let result;
  try {
    result = await saveBusinessDetails(actor, ventureId, values);
  } catch (error) {
    return accessFailure(error);
  }
  if (!result.ok)
    return { status: "error", message: result.message, fieldErrors: result.fieldErrors, values };
  redirect(stepPath(ventureId, "data-connections"));
}

/** Read-only Companies House lookup; the user decides whether to apply any result. */
export async function lookupCompanyAction(
  ventureId: string,
  companyNumber: string,
): Promise<CompanyLookupResult | { status: "error"; message: string }> {
  const actor = await requireActor();
  try {
    return await lookupCompany(actor, ventureId, companyNumber);
  } catch (error) {
    const failure = accessFailure(error);
    return {
      status: "error",
      message: failure.status === "error" ? failure.message : "Lookup failed.",
    };
  }
}

export async function completeDataConnectionsAction(
  ventureId: string,
): Promise<OnboardingFormState> {
  const actor = await requireActor();
  let result;
  try {
    result = await completeDataConnections(actor, ventureId);
  } catch (error) {
    return accessFailure(error);
  }
  if (!result.ok) return { status: "error", message: result.message };
  redirect(stepPath(ventureId, "review"));
}

export async function completeOnboardingAction(ventureId: string): Promise<OnboardingFormState> {
  const actor = await requireActor();
  let result;
  try {
    result = await completeOnboarding(actor, ventureId);
  } catch (error) {
    return accessFailure(error);
  }
  if (!result.ok)
    return { status: "error", message: result.message, fieldErrors: result.fieldErrors };
  // The review page renders the "workspace ready" UX state; the venture is already active.
  return { status: "complete" };
}
