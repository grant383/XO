import type { Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closePools } from "@/platform/db";
import { UnconfiguredCompanyRegistry } from "@/platform/integrations/companies-house";
import {
  completeDataConnections,
  createDraftVenture,
  listDraftOnboarding,
  saveBusinessDetails,
} from "@/modules/ventures";
import { adminSql } from "../../helpers/db";
import { createUser, VALID_BUSINESS } from "../../helpers/ventures";

/**
 * The onboarding route/action layer (src/app/onboarding) against the real ventures module
 * and database. Only the request boundary is replaced: the session and request headers.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ getAll: () => [] }),
}));
vi.mock("@/modules/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/identity")>()),
  CORRELATION_HEADER: "x-correlation-id",
  getSession: async () =>
    session.userId ? { userId: session.userId, name: "Test", email: "t@example.test" } : null,
  hasSessionCookie: async () => false,
}));

const { loadOnboardingPage, resumePath } = await import("@/app/onboarding/guard");
const { saveBusinessAction, completeDataConnectionsAction, completeOnboardingAction } =
  await import("@/app/onboarding/actions");

let admin: Sql;
const registry = new UnconfiguredCompanyRegistry();
const idle = { status: "idle" } as const;

beforeAll(() => {
  admin = adminSql();
});
beforeEach(() => {
  session.userId = null;
});
afterAll(async () => {
  await closePools();
  await admin.end();
});

/** Next.js signals redirect/notFound by throwing an error carrying a digest. */
async function digestOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const digest = (error as { digest?: unknown }).digest;
    if (typeof digest === "string") return digest;
    throw error;
  }
  throw new Error("expected a redirect or notFound");
}
const redirectTo = (digest: string) =>
  digest.startsWith("NEXT_REDIRECT;") ? digest.split(";")[2] : undefined;
const NOT_FOUND = "NEXT_HTTP_ERROR_FALLBACK;404";

function businessForm() {
  const data = new FormData();
  for (const [k, v] of Object.entries(VALID_BUSINESS)) data.set(k, v);
  return data;
}

async function draftFor(label: string, name = "Route Co") {
  const owner = await createUser(admin, label);
  const res = await createDraftVenture(owner, { name });
  if (!res.ok) throw new Error(res.message);
  return { owner, ventureId: res.data.ventureId };
}

const ventureState = async (ventureId: string) => {
  const [row] = await admin`select v.status, o.current_step, o.business_completed_at
                            from ventures v join venture_onboarding o on o.venture_id = v.id
                            where v.id = ${ventureId}`;
  return row!;
};

describe("resume from /onboarding", () => {
  it("links each owned draft to its persisted currentStep", async () => {
    const owner = await createUser(admin, "resume");
    const ids: Record<string, string> = {};
    for (const name of ["At Business", "At Data", "At Review"]) {
      const res = await createDraftVenture(owner, { name });
      if (!res.ok) throw new Error(res.message);
      ids[name] = res.data.ventureId;
    }
    expect((await saveBusinessDetails(owner, ids["At Data"]!, VALID_BUSINESS, registry)).ok).toBe(
      true,
    );
    expect((await saveBusinessDetails(owner, ids["At Review"]!, VALID_BUSINESS, registry)).ok).toBe(
      true,
    );
    expect((await completeDataConnections(owner, ids["At Review"]!)).ok).toBe(true);

    const links = Object.fromEntries(
      (await listDraftOnboarding(owner)).map((d) => [d.id, resumePath(d.id, d.currentStep)]),
    );
    expect(links).toEqual({
      [ids["At Business"]!]: `/onboarding/${ids["At Business"]}/business`,
      [ids["At Data"]!]: `/onboarding/${ids["At Data"]}/data-connections`,
      [ids["At Review"]!]: `/onboarding/${ids["At Review"]}/review`,
    });

    // /onboarding/[ventureId] redirects to the same persisted step.
    session.userId = owner.userId;
    const { default: VenturePage } = await import("@/app/onboarding/[ventureId]/page");
    const digest = await digestOf(() =>
      VenturePage({ params: Promise.resolve({ ventureId: ids["At Data"]! }) }),
    );
    expect(redirectTo(digest)).toBe(`/onboarding/${ids["At Data"]}/data-connections`);
  });

  it("lists only drafts the actor owns", async () => {
    const { owner, ventureId } = await draftFor("resume-owner");
    const member = await createUser(admin, "resume-member");
    await admin`insert into venture_memberships (venture_id, user_id, role)
                values (${ventureId}, ${member.userId}, 'admin')`;
    expect((await listDraftOnboarding(owner)).map((d) => d.id)).toEqual([ventureId]);
    expect(await listDraftOnboarding(member)).toEqual([]);
  });
});

describe("forged or inaccessible venture ids", () => {
  it("cannot load onboarding or mutate another owner's venture", async () => {
    const a = await draftFor("forge-a");
    const b = await draftFor("forge-b");
    session.userId = a.owner.userId;

    for (const id of [b.ventureId, "not-a-uuid", "00000000-0000-4000-8000-000000000000"]) {
      expect(await digestOf(() => loadOnboardingPage(id))).toBe(NOT_FOUND);
    }
    const notFound = { status: "error", message: "This venture could not be found." };
    expect(await saveBusinessAction(b.ventureId, idle, businessForm())).toEqual(notFound);
    expect(await completeDataConnectionsAction(b.ventureId)).toEqual(notFound);
    expect(await completeOnboardingAction(b.ventureId)).toEqual(notFound);

    expect(await ventureState(b.ventureId)).toMatchObject({
      status: "draft",
      current_step: "business",
      business_completed_at: null,
    });
    expect(
      await admin`select 1 from audit_log where venture_id = ${b.ventureId}
                  and actor_user_id = ${a.owner.userId}`,
    ).toHaveLength(0);
  });

  it("requires a session", async () => {
    const { ventureId } = await draftFor("anon");
    // Pages return to themselves after sign-in; actions re-render the page that posted them.
    expect(redirectTo(await digestOf(() => loadOnboardingPage(ventureId)))).toBe(
      `/auth/login?next=${encodeURIComponent(`/onboarding/${ventureId}`)}`,
    );
    expect(redirectTo(await digestOf(() => completeOnboardingAction(ventureId)))).toBe(
      "/auth/login",
    );
  });
});

describe("non-Owner members", () => {
  it("cannot load or mutate onboarding through the action layer", async () => {
    const { ventureId } = await draftFor("non-owner");
    for (const role of ["admin", "manager", "operator", "viewer"] as const) {
      const member = await createUser(admin, `member-${role}`);
      await admin`insert into venture_memberships (venture_id, user_id, role)
                  values (${ventureId}, ${member.userId}, ${role})`;
      session.userId = member.userId;

      expect(await loadOnboardingPage(ventureId)).toEqual({ kind: "forbidden" });
      const denied = {
        status: "error",
        message: "Only the venture Owner can complete onboarding.",
      };
      expect(await saveBusinessAction(ventureId, idle, businessForm())).toMatchObject(denied);
      expect(await completeDataConnectionsAction(ventureId)).toEqual(denied);
      expect(await completeOnboardingAction(ventureId)).toEqual(denied);
      expect(
        await admin`select 1 from audit_log where venture_id = ${ventureId}
                    and actor_user_id = ${member.userId}`,
      ).toHaveLength(0);
    }
    expect(await ventureState(ventureId)).toMatchObject({
      status: "draft",
      current_step: "business",
      business_completed_at: null,
    });
  });
});

describe("review completion", () => {
  it("activates only through the atomic completion function, after every step", async () => {
    const { owner, ventureId } = await draftFor("complete");
    session.userId = owner.userId;

    // Confirming early is refused and the venture stays draft.
    expect(await completeOnboardingAction(ventureId)).toMatchObject({ status: "error" });
    expect((await ventureState(ventureId)).status).toBe("draft");

    expect(
      redirectTo(await digestOf(() => saveBusinessAction(ventureId, idle, businessForm()))),
    ).toBe(`/onboarding/${ventureId}/data-connections`);
    expect(redirectTo(await digestOf(() => completeDataConnectionsAction(ventureId)))).toBe(
      `/onboarding/${ventureId}/review`,
    );
    expect((await ventureState(ventureId)).status).toBe("draft");

    // Completion returns the "workspace ready" UX state; activation already happened server-side.
    expect(await completeOnboardingAction(ventureId)).toEqual({ status: "complete" });
    expect(await ventureState(ventureId)).toMatchObject({
      status: "active",
      current_step: "completed",
    });
    // Written only inside app.complete_venture_onboarding(), in the activating transaction.
    const actions = (
      await admin`select action from audit_log where venture_id = ${ventureId}
                  and action in ('venture.onboarding.completed', 'venture.activated')`
    ).map((r) => r.action);
    expect(actions.sort()).toEqual(["venture.activated", "venture.onboarding.completed"]);

    // A completed venture leaves onboarding.
    expect(redirectTo(await digestOf(() => loadOnboardingPage(ventureId)))).toBe("/");
  });
});
