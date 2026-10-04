import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools } from "@/platform/db";
import { UnconfiguredCompanyRegistry } from "@/platform/integrations/companies-house";
import {
  completeDataConnections,
  completeOnboarding,
  createDraftVenture,
  getDataConnectionsStatus,
  getOnboarding,
  lookupCompany,
  resolveVenture,
  saveBusinessDetails,
  VentureStateError,
} from "@/modules/ventures";
import { adminSql } from "../../helpers/db";
import { createUser, fixtureRegistry, VALID_BUSINESS } from "../../helpers/ventures";

let admin: Sql;
const unconfigured = new UnconfiguredCompanyRegistry();

beforeAll(() => {
  admin = adminSql();
});
afterAll(async () => {
  await closePools();
  await admin.end();
});

async function setup(label: string) {
  const owner = await createUser(admin, label);
  const res = await createDraftVenture(owner, { name: "Onboarding Co" });
  if (!res.ok) throw new Error(res.message);
  return { owner, ventureId: res.data.ventureId };
}

const actions = async (ventureId: string) =>
  (
    await admin`select action from audit_log where venture_id = ${ventureId} order by occurred_at, id`
  ).map((r) => r.action);

describe("business details validation", () => {
  it.each([
    [{ reportingCurrency: "ABC" }, "reportingCurrency"],
    [{ reportingCurrency: "POUNDS" }, "reportingCurrency"],
    [{ timezone: "Mars/Olympus_Mons" }, "timezone"],
    [{ timezone: "GMT+1" }, "timezone"],
    [{ companyNumber: "12345678901" }, "companyNumber"],
    [{ companyNumber: "S1234567" }, "companyNumber"],
    [{ fiscalYearStartMonth: "13" }, "fiscalYearStartMonth"],
    [{ fiscalYearStartMonth: "" }, "fiscalYearStartMonth"],
    [{ name: "  " }, "name"],
    [{ sector: "gambling" }, "sector"],
  ])("rejects %o", async (override, field) => {
    const { owner, ventureId } = await setup("invalid");
    const res = await saveBusinessDetails(
      owner,
      ventureId,
      { ...VALID_BUSINESS, ...override },
      unconfigured,
    );
    expect(res).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(Object.keys((res as { fieldErrors: object }).fieldErrors)).toContain(field);
    const [o] =
      await admin`select business_completed_at from venture_onboarding where venture_id = ${ventureId}`;
    expect(o!.business_completed_at).toBeNull();
  });

  it("normalises accepted values", async () => {
    const { owner, ventureId } = await setup("normalise");
    const res = await saveBusinessDetails(
      owner,
      ventureId,
      {
        ...VALID_BUSINESS,
        reportingCurrency: "eur",
        timezone: "Europe/Dublin",
        fiscalYearStartMonth: "1",
      },
      unconfigured,
    );
    expect(res.ok).toBe(true);
    const view = await getOnboarding(owner, ventureId);
    expect(view.venture).toMatchObject({
      reportingCurrency: "EUR",
      timezone: "Europe/Dublin",
      fiscalYearStartMonth: 1,
      legalName: null,
    });
    expect(view.onboarding).toMatchObject({
      currentStep: "data_connections",
      companyVerificationStatus: "not_provided",
    });
  });
});

describe("Companies House verification", () => {
  it("verifies a company number and records source metadata without overwriting user input", async () => {
    const { owner, ventureId } = await setup("ch-ok");
    const lookup = await lookupCompany(owner, ventureId, "1234567", fixtureRegistry());
    expect(lookup).toMatchObject({
      status: "found",
      company: { name: "ACME PLUMBING LIMITED", status: "active" },
    });

    const res = await saveBusinessDetails(
      owner,
      ventureId,
      { ...VALID_BUSINESS, companyNumber: "1234567", legalName: "Acme Plumbing & Heating Ltd" },
      fixtureRegistry(),
    );
    expect(res.ok).toBe(true);
    const view = await getOnboarding(owner, ventureId);
    expect(view.venture).toMatchObject({
      companyNumber: "01234567",
      legalName: "Acme Plumbing & Heating Ltd",
      name: "Acme Plumbing",
    });
    expect(view.onboarding.companyVerificationStatus).toBe("verified");
    expect(view.onboarding.companyVerification).toMatchObject({
      companyNumber: "01234567",
      name: "ACME PLUMBING LIMITED",
      status: "active",
      legalNameMatches: false,
      source: { provider: "companies-house", reference: "/company/01234567" },
    });
    expect(view.onboarding.companyVerifiedAt).not.toBeNull();
  });

  it("requires a legal name when the company is verified, suggesting the registered one", async () => {
    const { owner, ventureId } = await setup("ch-legal");
    const res = await saveBusinessDetails(
      owner,
      ventureId,
      { ...VALID_BUSINESS, companyNumber: "01234567" },
      fixtureRegistry(),
    );
    expect(res).toMatchObject({
      ok: false,
      code: "VALIDATION",
      fieldErrors: { legalName: expect.stringContaining("ACME PLUMBING LIMITED") },
    });
  });

  it("rejects a well-formed number that Companies House does not know", async () => {
    const { owner, ventureId } = await setup("ch-404");
    expect(await lookupCompany(owner, ventureId, "09999999", fixtureRegistry())).toEqual({
      status: "not_found",
    });
    expect(await lookupCompany(owner, ventureId, "nope", fixtureRegistry())).toEqual({
      status: "invalid_number",
    });
    const res = await saveBusinessDetails(
      owner,
      ventureId,
      { ...VALID_BUSINESS, companyNumber: "09999999" },
      fixtureRegistry(),
    );
    expect(res).toMatchObject({ ok: false, fieldErrors: { companyNumber: expect.any(String) } });
  });

  it("continues manually when Companies House is unavailable, recording the outage", async () => {
    const { owner, ventureId } = await setup("ch-down");
    const down = fixtureRegistry();
    down.available = false;
    expect(await lookupCompany(owner, ventureId, "01234567", down)).toEqual({
      status: "unavailable",
    });

    const res = await saveBusinessDetails(
      owner,
      ventureId,
      { ...VALID_BUSINESS, companyNumber: "01234567", legalName: "Acme Plumbing Ltd" },
      down,
    );
    expect(res.ok).toBe(true);
    const view = await getOnboarding(owner, ventureId);
    expect(view.onboarding.companyVerificationStatus).toBe("unavailable");
    expect(view.venture.companyNumber).toBe("01234567");

    expect((await completeDataConnections(owner, ventureId)).ok).toBe(true);
    expect((await completeOnboarding(owner, ventureId)).ok).toBe(true);
    expect((await resolveVenture(owner, ventureId)).status).toBe("active");
  });
});

describe("onboarding state transitions", () => {
  it("completes the manual path without Companies House: draft -> active", async () => {
    const { owner, ventureId } = await setup("manual");
    const status = await getDataConnectionsStatus(owner, ventureId, unconfigured);
    expect(status).toMatchObject({
      companiesHouse: { configured: false, verification: "not_provided" },
      billing: { status: "not_started" },
    });

    expect((await saveBusinessDetails(owner, ventureId, VALID_BUSINESS, unconfigured)).ok).toBe(
      true,
    );
    expect((await getOnboarding(owner, ventureId)).onboarding.currentStep).toBe("data_connections");
    expect((await completeDataConnections(owner, ventureId)).ok).toBe(true);
    expect((await getOnboarding(owner, ventureId)).onboarding.currentStep).toBe("review");
    expect((await completeOnboarding(owner, ventureId)).ok).toBe(true);

    expect(await resolveVenture(owner, ventureId)).toMatchObject({ status: "active" });
    const [o] =
      await admin`select current_step, completed_at from venture_onboarding where venture_id = ${ventureId}`;
    expect(o!.current_step).toBe("completed");
    // Onboarding routes no longer accept the venture.
    await expect(getOnboarding(owner, ventureId)).rejects.toBeInstanceOf(VentureStateError);
    await expect(completeOnboarding(owner, ventureId)).rejects.toBeInstanceOf(VentureStateError);
  });

  it("cannot activate with incomplete onboarding", async () => {
    const { owner, ventureId } = await setup("incomplete");
    expect(await completeOnboarding(owner, ventureId)).toMatchObject({
      ok: false,
      code: "STEPS_INCOMPLETE",
    });
    expect(await completeDataConnections(owner, ventureId)).toMatchObject({
      ok: false,
      code: "STEPS_INCOMPLETE",
    });
    await saveBusinessDetails(owner, ventureId, VALID_BUSINESS, unconfigured);
    expect(await completeOnboarding(owner, ventureId)).toMatchObject({
      ok: false,
      code: "STEPS_INCOMPLETE",
    });
    expect((await resolveVenture(owner, ventureId)).status).toBe("draft");
    expect(await actions(ventureId)).toContain("venture.onboarding.completion_rejected");
  });

  it("revalidates at completion and leaves everything unchanged on failure (atomic)", async () => {
    const { owner, ventureId } = await setup("atomic");
    await saveBusinessDetails(owner, ventureId, VALID_BUSINESS, unconfigured);
    await completeDataConnections(owner, ventureId);
    await admin`update ventures set fiscal_year_start_month = null where id = ${ventureId}`;

    const res = await completeOnboarding(owner, ventureId);
    expect(res).toMatchObject({
      ok: false,
      code: "INVALID_SETTINGS",
      fieldErrors: { fiscalYearStartMonth: "Required" },
    });
    const [v] = await admin`select status from ventures where id = ${ventureId}`;
    const [o] =
      await admin`select current_step, review_completed_at, completed_at from venture_onboarding where venture_id = ${ventureId}`;
    expect(v!.status).toBe("draft");
    expect(o).toEqual({ current_step: "review", review_completed_at: null, completed_at: null });
    expect(await actions(ventureId)).not.toContain("venture.activated");
  });

  it("activates exactly once under concurrent confirmation", async () => {
    const { owner, ventureId } = await setup("race");
    await saveBusinessDetails(owner, ventureId, VALID_BUSINESS, unconfigured);
    await completeDataConnections(owner, ventureId);
    const results = await Promise.allSettled([
      completeOnboarding(owner, ventureId),
      completeOnboarding(owner, ventureId),
    ]);
    const succeeded = results.filter((r) => r.status === "fulfilled" && r.value.ok);
    expect(succeeded).toHaveLength(1);
    expect((await actions(ventureId)).filter((a) => a === "venture.activated")).toHaveLength(1);
  });

  it("records an audit trail for every material onboarding change", async () => {
    const { owner, ventureId } = await setup("audit");
    await saveBusinessDetails(
      owner,
      ventureId,
      { ...VALID_BUSINESS, companyNumber: "01234567", legalName: "ACME PLUMBING LIMITED" },
      fixtureRegistry(),
    );
    await completeDataConnections(owner, ventureId);
    await completeOnboarding(owner, ventureId);

    const rows = await admin`select action, actor_user_id, venture_id, metadata, correlation_id
                             from audit_log where venture_id = ${ventureId} order by occurred_at, id`;
    // Rows written in one transaction share a timestamp, so compare as a set.
    expect(rows.map((r) => r.action).sort()).toEqual(
      [
        "venture.created",
        "venture.onboarding.business_saved",
        "venture.company.verification",
        "venture.onboarding.data_connections_completed",
        "venture.onboarding.completed",
        "venture.activated",
      ].sort(),
    );
    const byAction = Object.fromEntries(rows.map((r) => [r.action, r]));
    for (const r of rows) {
      expect(r.actor_user_id).toBe(owner.userId);
      expect(r.correlation_id).toBe(owner.correlationId);
    }
    expect(byAction["venture.onboarding.business_saved"]!.metadata.changedFields).toEqual(
      expect.arrayContaining([
        "name",
        "legalName",
        "companyNumber",
        "sector",
        "fiscalYearStartMonth",
      ]),
    );
    expect(byAction["venture.company.verification"]!.metadata).toMatchObject({
      status: "verified",
      legalNameMatches: true,
      provider: "companies-house",
    });
  });
});
