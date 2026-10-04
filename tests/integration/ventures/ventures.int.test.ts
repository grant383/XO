import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools } from "@/platform/db";
import { UnconfiguredCompanyRegistry } from "@/platform/integrations/companies-house";
import {
  completeDataConnections,
  completeOnboarding,
  createDraftVenture,
  getOnboarding,
  listDraftVentures,
  listMyVentures,
  listSwitchableVentures,
  lookupCompany,
  resolveSelectedVenture,
  resolveVenture,
  saveBusinessDetails,
  VentureNotFoundError,
  VenturePermissionError,
  VentureStateError,
} from "@/modules/ventures";
import { adminSql, forceOwnerMembershipStatus, seedTwoVentures } from "../../helpers/db";
import { createUser, fixtureRegistry, VALID_BUSINESS } from "../../helpers/ventures";

let admin: Sql;
const registry = new UnconfiguredCompanyRegistry();

beforeAll(() => {
  admin = adminSql();
});
afterAll(async () => {
  await closePools();
  await admin.end();
});

async function draft(actor: { userId: string; correlationId?: string }, name = "Draft Venture") {
  const res = await createDraftVenture(actor, { name });
  if (!res.ok) throw new Error(res.message);
  return res.data.ventureId;
}

async function activate(actor: { userId: string }, ventureId: string) {
  expect((await saveBusinessDetails(actor, ventureId, VALID_BUSINESS, registry)).ok).toBe(true);
  expect((await completeDataConnections(actor, ventureId)).ok).toBe(true);
  expect((await completeOnboarding(actor, ventureId)).ok).toBe(true);
}

describe("venture creation", () => {
  it("creates a draft venture owned by the creator with onboarding at the business step", async () => {
    const owner = await createUser(admin, "creator");
    const ventureId = await draft(owner, "  New Co  ");

    const access = await resolveVenture(owner, ventureId);
    expect(access).toMatchObject({ id: ventureId, name: "New Co", status: "draft", role: "owner" });
    const view = await getOnboarding(owner, ventureId);
    expect(view.onboarding).toMatchObject({ currentStep: "business", completedAt: null });

    const members =
      await admin`select user_id, role from venture_memberships where venture_id = ${ventureId}`;
    expect(members).toEqual([{ user_id: owner.userId, role: "owner" }]);
    const [audit] = await admin`select action, actor_user_id, correlation_id from audit_log
                                where venture_id = ${ventureId}`;
    expect(audit).toEqual({
      action: "venture.created",
      actor_user_id: owner.userId,
      correlation_id: owner.correlationId,
    });
  });

  it("rejects invalid names and is idempotent for a repeated request id", async () => {
    const owner = await createUser(admin, "dup");
    expect(await createDraftVenture(owner, { name: "   " })).toMatchObject({
      ok: false,
      code: "VALIDATION",
    });
    expect(await createDraftVenture(owner, { name: "x".repeat(201) })).toMatchObject({
      ok: false,
      code: "VALIDATION",
    });

    const requestId = randomUUID();
    const a = await createDraftVenture(owner, { name: "Once", requestId });
    const b = await createDraftVenture(owner, { name: "Once", requestId });
    expect(a).toEqual(b);
    expect(await admin`select 1 from ventures where created_by = ${owner.userId}`).toHaveLength(1);
  });

  it("limits open drafts", async () => {
    const owner = await createUser(admin, "limit");
    for (let i = 0; i < 5; i++) await draft(owner, `D${i}`);
    expect(await createDraftVenture(owner, { name: "Sixth" })).toMatchObject({
      ok: false,
      code: "DRAFT_LIMIT",
    });
  });
});

describe("listing and switching", () => {
  it("lists only the caller's ventures; drafts are excluded from switching", async () => {
    const alice = await createUser(admin, "alice");
    const bob = await createUser(admin, "bob");
    const aDraft = await draft(alice, "Alice Draft");
    const aActive = await draft(alice, "Alice Active");
    await activate(alice, aActive);
    const bDraft = await draft(bob, "Bob Draft");

    const mine = await listMyVentures(alice);
    expect(mine.map((v) => v.id).sort()).toEqual([aActive, aDraft].sort());
    expect(mine.map((v) => v.id)).not.toContain(bDraft);
    expect((await listSwitchableVentures(alice)).map((v) => v.id)).toEqual([aActive]);
    expect((await listDraftVentures(alice)).map((v) => v.id)).toEqual([aDraft]);

    expect(await resolveSelectedVenture(alice, aActive)).toMatchObject({
      id: aActive,
      status: "active",
    });
    await expect(resolveSelectedVenture(alice, aDraft)).rejects.toBeInstanceOf(VentureStateError);
    await expect(resolveSelectedVenture(alice, bDraft)).rejects.toBeInstanceOf(
      VentureNotFoundError,
    );
  });

  it("rejects malformed, unknown and inaccessible venture ids identically", async () => {
    const alice = await createUser(admin, "ids");
    const other = await createUser(admin, "other");
    const theirs = await draft(other);
    for (const id of ["not-a-uuid", "", randomUUID(), theirs]) {
      await expect(resolveVenture(alice, id)).rejects.toBeInstanceOf(VentureNotFoundError);
    }
  });
});

describe("cross-venture isolation", () => {
  it("Venture A's owner cannot read Venture B's onboarding", async () => {
    const a = await createUser(admin, "a");
    const b = await createUser(admin, "b");
    await draft(a);
    const ventureB = await draft(b);
    await expect(getOnboarding(a, ventureB)).rejects.toBeInstanceOf(VentureNotFoundError);
    await expect(lookupCompany(a, ventureB, "01234567", fixtureRegistry())).rejects.toBeInstanceOf(
      VentureNotFoundError,
    );
  });

  it("Venture A's owner cannot modify Venture B with a forged route venture id", async () => {
    const a = await createUser(admin, "a2");
    const b = await createUser(admin, "b2");
    await draft(a);
    const ventureB = await draft(b, "Bob Co");

    await expect(
      saveBusinessDetails(a, ventureB, { ...VALID_BUSINESS, name: "Hijacked" }, registry),
    ).rejects.toBeInstanceOf(VentureNotFoundError);
    await expect(completeDataConnections(a, ventureB)).rejects.toBeInstanceOf(VentureNotFoundError);
    await expect(completeOnboarding(a, ventureB)).rejects.toBeInstanceOf(VentureNotFoundError);

    const [v] = await admin`select name, status from ventures where id = ${ventureB}`;
    expect(v).toEqual({ name: "Bob Co", status: "draft" });
    const [o] =
      await admin`select business_completed_at from venture_onboarding where venture_id = ${ventureB}`;
    expect(o!.business_completed_at).toBeNull();
    expect(
      await admin`select 1 from audit_log where venture_id = ${ventureB} and actor_user_id = ${a.userId}`,
    ).toHaveLength(0);
  });

  it("requires the Owner role: other members of the venture cannot run onboarding", async () => {
    const f = await seedTwoVentures(admin); // Venture A (draft): alice owner, dave admin, erin manager
    await admin`insert into venture_onboarding (venture_id, updated_by) values (${f.ventureA}, ${f.user.alice})`;
    for (const userId of [f.user.dave, f.user.erin, f.user.carol]) {
      await expect(getOnboarding({ userId }, f.ventureA)).rejects.toBeInstanceOf(
        VenturePermissionError,
      );
      await expect(
        saveBusinessDetails({ userId }, f.ventureA, VALID_BUSINESS, registry),
      ).rejects.toBeInstanceOf(VenturePermissionError);
    }
    // Dave is a manager in Venture B: still nothing in A beyond his role, nothing in other ventures.
    await expect(getOnboarding({ userId: f.user.mallory }, f.ventureA)).rejects.toBeInstanceOf(
      VentureNotFoundError,
    );
  });

  it("membership removal blocks onboarding immediately", async () => {
    const owner = await createUser(admin, "removed");
    const ventureId = await draft(owner);
    expect((await saveBusinessDetails(owner, ventureId, VALID_BUSINESS, registry)).ok).toBe(true);

    await forceOwnerMembershipStatus(admin, ventureId, "removed");
    await expect(getOnboarding(owner, ventureId)).rejects.toBeInstanceOf(VentureNotFoundError);
    await expect(completeDataConnections(owner, ventureId)).rejects.toBeInstanceOf(
      VentureNotFoundError,
    );
    await expect(completeOnboarding(owner, ventureId)).rejects.toBeInstanceOf(VentureNotFoundError);
    expect(await listMyVentures(owner)).toEqual([]);
    const [v] = await admin`select status from ventures where id = ${ventureId}`;
    expect(v!.status).toBe("draft");
  });
});
