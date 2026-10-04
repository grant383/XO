import { eq, sql } from "drizzle-orm";
import { schema, withTenant, withUser, type Tx } from "@/platform/db";
import { emailEnv } from "@/platform/config/env";
import {
  CompanyRegistryUnavailableError,
  normaliseCompanyNumber,
  type CompanyRecord,
  type CompanyRegistry,
} from "@/platform/integrations/companies-house";
import { logger } from "@/platform/observability/logger";
import { resolveVenture, type Actor, type VentureAccess } from "./access";
import { pgCode, pgMessage, VentureNotFoundError, VenturePermissionError } from "./errors";
import { businessDetailsInput, ventureNameInput, type BusinessDetails } from "./policy";
import { companyRegistry } from "./registry";

const { ventures, ventureOnboarding, auditLog } = schema;

export type OnboardingStep = "business" | "data_connections" | "review" | "completed";
export type CompanyVerificationStatus = "not_provided" | "verified" | "not_found" | "unavailable";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | {
      ok: false;
      code:
        | "VALIDATION"
        | "DRAFT_LIMIT"
        | "STEPS_INCOMPLETE"
        | "INVALID_SETTINGS"
        | "NOT_PERMITTED"
        | "INVALID_STATE";
      message: string;
      fieldErrors?: Record<string, string>;
    };

const fail = (
  code: Exclude<ActionResult, { ok: true }>["code"],
  message: string,
  fieldErrors?: Record<string, string>,
): ActionResult<never> => ({ ok: false, code, message, ...(fieldErrors ? { fieldErrors } : {}) });

/** Onboarding actions require the active Owner of a draft venture. */
const OWNER_OF_DRAFT = { roles: ["owner"], statuses: ["draft"] } as const;

async function recordVentureEvent(
  tx: Tx,
  access: VentureAccess,
  action: string,
  metadata: Record<string, unknown> = {},
  outcome: "success" | "failure" | "denied" = "success",
) {
  await tx.insert(auditLog).values({
    ventureId: access.id,
    actorType: "user",
    actorUserId: access.userId,
    action,
    targetType: "venture",
    targetId: access.id,
    outcome,
    metadata,
    correlationId: access.correlationId ?? null,
  });
}

const tenant = (access: VentureAccess) => ({
  userId: access.userId,
  ventureId: access.id,
  correlationId: access.correlationId,
});

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

/**
 * Creates a draft venture through `app.create_venture()`, which atomically inserts the
 * venture, the actor's Owner membership, onboarding state and an audit record. A repeated
 * `requestId` (double submit / retry) returns the same venture.
 */
export async function createDraftVenture(
  actor: Actor,
  input: { name: unknown; requestId?: string },
): Promise<ActionResult<{ ventureId: string }>> {
  const parsed = ventureNameInput.safeParse({ name: input.name });
  if (!parsed.success) {
    return fail("VALIDATION", "Check the highlighted fields.", {
      name: "Enter the business name (up to 200 characters).",
    });
  }
  const requestId =
    input.requestId && /^[0-9a-f-]{36}$/i.test(input.requestId) ? input.requestId : null;
  try {
    const ventureId = await withUser(
      { userId: actor.userId, correlationId: actor.correlationId },
      async (tx) => {
        const rows = await tx.execute<{ id: string }>(
          sql`select app.create_venture(${parsed.data.name}, null, null, 'GB', 'GBP', 'Europe/London', ${requestId}::uuid) as id`,
        );
        return rows[0]!.id;
      },
    );
    return { ok: true, data: { ventureId } };
  } catch (error) {
    if (pgCode(error) === "DXV01") {
      return fail(
        "DRAFT_LIMIT",
        "You have too many ventures awaiting setup. Finish or remove one first.",
      );
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Read model
// ---------------------------------------------------------------------------

export type CompanyVerificationSnapshot = {
  companyNumber: string;
  name: string;
  status: string;
  registeredOffice?: CompanyRecord["registeredOffice"];
  source: CompanyRecord["source"];
  legalNameMatches: boolean;
};

export type OnboardingView = {
  venture: {
    id: string;
    name: string;
    legalName: string | null;
    companyNumber: string | null;
    sector: string | null;
    reportingCurrency: string;
    timezone: string;
    fiscalYearStartMonth: number | null;
    status: string;
  };
  onboarding: {
    currentStep: OnboardingStep;
    businessCompletedAt: Date | null;
    dataConnectionsCompletedAt: Date | null;
    reviewCompletedAt: Date | null;
    completedAt: Date | null;
    companyVerificationStatus: CompanyVerificationStatus;
    companyVerification: CompanyVerificationSnapshot | { reason: string } | null;
    companyVerifiedAt: Date | null;
  };
};

async function readOnboarding(access: VentureAccess): Promise<OnboardingView> {
  const [row] = await withTenant(tenant(access), (tx) =>
    tx
      .select({ venture: ventures, onboarding: ventureOnboarding })
      .from(ventures)
      .innerJoin(ventureOnboarding, eq(ventureOnboarding.ventureId, ventures.id))
      .where(eq(ventures.id, access.id)),
  );
  if (!row) throw new VentureNotFoundError();
  const { venture: v, onboarding: o } = row;
  return {
    venture: {
      id: v.id,
      name: v.name,
      legalName: v.legalName,
      companyNumber: v.companyNumber,
      sector: v.sector,
      reportingCurrency: v.reportingCurrency,
      timezone: v.timezone,
      fiscalYearStartMonth: v.fiscalYearStartMonth,
      status: v.status,
    },
    onboarding: {
      currentStep: o.currentStep,
      businessCompletedAt: o.businessCompletedAt,
      dataConnectionsCompletedAt: o.dataConnectionsCompletedAt,
      reviewCompletedAt: o.reviewCompletedAt,
      completedAt: o.completedAt,
      companyVerificationStatus: o.companyVerificationStatus,
      companyVerification:
        o.companyVerification as OnboardingView["onboarding"]["companyVerification"],
      companyVerifiedAt: o.companyVerifiedAt,
    },
  };
}

/** Onboarding state for the Owner of a draft venture. */
export async function getOnboarding(actor: Actor, ventureId: string): Promise<OnboardingView> {
  return readOnboarding(await resolveVenture(actor, ventureId, OWNER_OF_DRAFT));
}

// ---------------------------------------------------------------------------
// Companies House lookup
// ---------------------------------------------------------------------------

export type CompanyLookupResult =
  | { status: "found"; company: CompanyRecord }
  | { status: "not_found" }
  | { status: "invalid_number" }
  | { status: "unavailable" };

async function lookup(registry: CompanyRegistry, number: string): Promise<CompanyLookupResult> {
  try {
    const company = await registry.getCompany(number);
    return company ? { status: "found", company } : { status: "not_found" };
  } catch (error) {
    if (error instanceof CompanyRegistryUnavailableError) {
      logger.warn(
        { companyRegistry: { reason: error.reason, status: error.status } },
        "company registry unavailable",
      );
      return { status: "unavailable" };
    }
    throw error;
  }
}

/**
 * Looks up a company for the onboarding form. Read-only: results are suggestions the
 * Owner may apply explicitly; nothing is written.
 */
export async function lookupCompany(
  actor: Actor,
  ventureId: string,
  companyNumber: string,
  registry: CompanyRegistry = companyRegistry(),
): Promise<CompanyLookupResult> {
  await resolveVenture(actor, ventureId, OWNER_OF_DRAFT);
  const number = normaliseCompanyNumber(companyNumber);
  if (!number) return { status: "invalid_number" };
  return lookup(registry, number);
}

// ---------------------------------------------------------------------------
// Step 1: business details
// ---------------------------------------------------------------------------

function fieldErrorsOf(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

const normaliseName = (v: string | null) => (v ?? "").trim().toUpperCase().replace(/\s+/g, " ");

/**
 * Saves business details and marks the business step complete. If a company number is
 * supplied it is verified with Companies House; provider results never overwrite what the
 * Owner entered. When the provider is unavailable the step still completes (manual path).
 */
export async function saveBusinessDetails(
  actor: Actor,
  ventureId: string,
  input: unknown,
  registry: CompanyRegistry = companyRegistry(),
): Promise<ActionResult> {
  const access = await resolveVenture(actor, ventureId, OWNER_OF_DRAFT);
  const parsed = businessDetailsInput.safeParse(input);
  if (!parsed.success)
    return fail("VALIDATION", "Check the highlighted fields.", fieldErrorsOf(parsed.error));
  const details: BusinessDetails = parsed.data;

  // Network lookup happens before the transaction so no locks are held during it.
  let verificationStatus: CompanyVerificationStatus = "not_provided";
  let verification: CompanyVerificationSnapshot | { reason: string; attemptedAt: string } | null =
    null;
  if (details.companyNumber) {
    const result = await lookup(registry, details.companyNumber);
    if (result.status === "not_found") {
      return fail("VALIDATION", "Check the highlighted fields.", {
        companyNumber:
          "Companies House has no company with this number. Check it, or leave it blank.",
      });
    }
    if (result.status === "found") {
      if (!details.legalName) {
        return fail("VALIDATION", "Check the highlighted fields.", {
          legalName: `Enter the registered legal name. Companies House lists "${result.company.name}".`,
        });
      }
      verificationStatus = "verified";
      verification = {
        companyNumber: result.company.companyNumber,
        name: result.company.name,
        status: result.company.status,
        registeredOffice: result.company.registeredOffice,
        source: result.company.source,
        legalNameMatches: normaliseName(details.legalName) === normaliseName(result.company.name),
      };
    } else {
      verificationStatus = "unavailable";
      verification = { reason: "provider_unavailable", attemptedAt: new Date().toISOString() };
    }
  }

  await withTenant(tenant(access), async (tx) => {
    const [before] = await tx.select().from(ventures).where(eq(ventures.id, access.id));
    if (!before) throw new VentureNotFoundError();

    const updated = await tx
      .update(ventures)
      .set({
        name: details.name,
        legalName: details.legalName,
        companyNumber: details.companyNumber,
        sector: details.sector,
        reportingCurrency: details.reportingCurrency,
        timezone: details.timezone,
        fiscalYearStartMonth: details.fiscalYearStartMonth,
      })
      .where(eq(ventures.id, access.id))
      .returning({ id: ventures.id });
    if (updated.length === 0) throw new VentureNotFoundError();

    const progressed = await tx
      .update(ventureOnboarding)
      .set({
        businessCompletedAt: sql`coalesce(${ventureOnboarding.businessCompletedAt}, now())`,
        currentStep: sql`case when ${ventureOnboarding.currentStep} = 'business' then 'data_connections'::onboarding_step else ${ventureOnboarding.currentStep} end`,
        companyVerificationStatus: verificationStatus,
        companyVerification: verification,
        companyVerifiedAt: verificationStatus === "verified" ? new Date() : null,
        updatedBy: access.userId,
      })
      .where(eq(ventureOnboarding.ventureId, access.id))
      .returning({ ventureId: ventureOnboarding.ventureId });
    if (progressed.length === 0) throw new VentureNotFoundError();

    const changed = (
      [
        ["name", before.name, details.name],
        ["legalName", before.legalName, details.legalName],
        ["companyNumber", before.companyNumber, details.companyNumber],
        ["sector", before.sector, details.sector],
        ["reportingCurrency", before.reportingCurrency, details.reportingCurrency],
        ["timezone", before.timezone, details.timezone],
        ["fiscalYearStartMonth", before.fiscalYearStartMonth, details.fiscalYearStartMonth],
      ] as const
    )
      .filter(([, a, b]) => a !== b)
      .map(([k]) => k);

    await recordVentureEvent(tx, access, "venture.onboarding.business_saved", {
      changedFields: changed,
    });
    if (details.companyNumber) {
      await recordVentureEvent(
        tx,
        access,
        "venture.company.verification",
        {
          status: verificationStatus,
          companyNumber: details.companyNumber,
          ...(verification && "legalNameMatches" in verification
            ? { legalNameMatches: verification.legalNameMatches, provider: "companies-house" }
            : {}),
        },
        verificationStatus === "verified" ? "success" : "failure",
      );
    }
  });
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Step 2: data connections (P0: status review only)
// ---------------------------------------------------------------------------

export type DataConnectionsStatus = {
  companiesHouse: { configured: boolean; verification: CompanyVerificationStatus };
  email: { configured: boolean; provider: string | null };
  billing: { status: "not_started" };
};

export async function getDataConnectionsStatus(
  actor: Actor,
  ventureId: string,
  registry: CompanyRegistry = companyRegistry(),
): Promise<DataConnectionsStatus> {
  const view = await getOnboarding(actor, ventureId);
  let email: DataConnectionsStatus["email"] = { configured: false, provider: null };
  try {
    email = { configured: true, provider: emailEnv().EMAIL_PROVIDER };
  } catch {
    // Not configured in this environment.
  }
  return {
    companiesHouse: {
      configured: registry.configured,
      verification: view.onboarding.companyVerificationStatus,
    },
    email,
    billing: { status: "not_started" },
  };
}

export async function completeDataConnections(
  actor: Actor,
  ventureId: string,
): Promise<ActionResult> {
  const access = await resolveVenture(actor, ventureId, OWNER_OF_DRAFT);
  return withTenant(tenant(access), async (tx) => {
    const [row] = await tx
      .select({ businessCompletedAt: ventureOnboarding.businessCompletedAt })
      .from(ventureOnboarding)
      .where(eq(ventureOnboarding.ventureId, access.id));
    if (!row) throw new VentureNotFoundError();
    if (!row.businessCompletedAt) {
      return fail("STEPS_INCOMPLETE", "Complete your business details first.");
    }
    const progressed = await tx
      .update(ventureOnboarding)
      .set({
        dataConnectionsCompletedAt: sql`coalesce(${ventureOnboarding.dataConnectionsCompletedAt}, now())`,
        currentStep: "review",
        updatedBy: access.userId,
      })
      .where(eq(ventureOnboarding.ventureId, access.id))
      .returning({ ventureId: ventureOnboarding.ventureId });
    if (progressed.length === 0) throw new VentureNotFoundError();
    await recordVentureEvent(tx, access, "venture.onboarding.data_connections_completed");
    return { ok: true as const, data: undefined };
  });
}

// ---------------------------------------------------------------------------
// Step 3: review and completion
// ---------------------------------------------------------------------------

/**
 * Completes onboarding and activates the venture via `app.complete_venture_onboarding()`,
 * which revalidates settings, re-checks Owner membership, requires every step and writes
 * audit records in one transaction. On any failure the venture remains a draft.
 */
export async function completeOnboarding(actor: Actor, ventureId: string): Promise<ActionResult> {
  const access = await resolveVenture(actor, ventureId, OWNER_OF_DRAFT);
  try {
    await withTenant(tenant(access), (tx) =>
      tx.execute(sql`select app.complete_venture_onboarding(${access.id}::uuid)`),
    );
    return { ok: true, data: undefined };
  } catch (error) {
    const code = pgCode(error);
    let result: ActionResult;
    switch (code) {
      case "DXV02":
        result = fail("STEPS_INCOMPLETE", "Complete every onboarding step before confirming.");
        break;
      case "DXV05": {
        const fields = /settings: ([\w,]+)/.exec(pgMessage(error))?.[1]?.split(",") ?? [];
        result = fail(
          "INVALID_SETTINGS",
          "Some business details are missing or invalid. Return to business details to fix them.",
          Object.fromEntries(fields.map((f) => [f, "Required"])),
        );
        break;
      }
      case "DXV03":
        throw new VenturePermissionError(["owner"]);
      case "DXV04":
        result = fail("INVALID_STATE", "This venture has already been set up.");
        break;
      default:
        throw error;
    }
    // Rejections are audited separately (the failed transaction rolled back).
    try {
      await withTenant(tenant(access), (tx) =>
        recordVentureEvent(
          tx,
          access,
          "venture.onboarding.completion_rejected",
          { reason: code },
          "failure",
        ),
      );
    } catch {
      logger.error(
        { audit: { action: "venture.onboarding.completion_rejected" } },
        "audit write failed",
      );
    }
    return result;
  }
}
