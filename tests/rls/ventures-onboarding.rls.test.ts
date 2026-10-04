import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools, schema, withTenant, withUser } from "@/platform/db";
import {
  adminSql,
  expectPgError,
  forceOwnerMembershipStatus,
  RLS_VIOLATION,
  seedTwoVentures,
} from "../helpers/db";

/**
 * Database-level guarantees for venture creation, lifecycle and onboarding (ADR-0012).
 * These hold regardless of application code.
 */
const { ventures, ventureOnboarding } = schema;
let admin: Sql;
let f: Awaited<ReturnType<typeof seedTwoVentures>>;

beforeAll(async () => {
  admin = adminSql();
  f = await seedTwoVentures(admin);
});
afterAll(async () => {
  await closePools();
  await admin.end();
});

async function newUser(label: string) {
  const id = randomUUID();
  await admin`insert into users (id, name, email, email_verified)
              values (${id}, ${label}, ${`${label}-${id.slice(0, 8)}@example.test`}, true)`;
  return id;
}

async function createVenture(userId: string, name = "Draft Co", requestId?: string) {
  return withUser({ userId, correlationId: "corr-create-0001" }, async (tx) => {
    const rows = await tx.execute<{ id: string }>(
      sql`select app.create_venture(${name}, null, null, 'GB', 'GBP', 'Europe/London', ${requestId ?? null}::uuid) as id`,
    );
    return rows[0]!.id;
  });
}

/** Marks the business and data-connection steps complete with valid settings (as admin). */
async function prepareForCompletion(ventureId: string, userId: string) {
  await admin`update ventures set sector = 'technology', fiscal_year_start_month = 4 where id = ${ventureId}`;
  await admin`update venture_onboarding set business_completed_at = now(),
              data_connections_completed_at = now(), current_step = 'review', updated_by = ${userId}
              where venture_id = ${ventureId}`;
}

const complete = (userId: string, ventureId: string, contextVenture = ventureId) =>
  withTenant({ userId, ventureId: contextVenture }, (tx) =>
    tx.execute(sql`select app.complete_venture_onboarding(${ventureId}::uuid)`),
  );

describe("atomic venture creation", () => {
  it("creates a draft venture, its sole Owner membership, onboarding state and an audit record together", async () => {
    const owner = await newUser("creator");
    const ventureId = await createVenture(owner, "  Acme Draft  ");

    const [v] = await admin`select name, status, created_by from ventures where id = ${ventureId}`;
    expect(v).toMatchObject({ name: "Acme Draft", status: "draft", created_by: owner });
    const members =
      await admin`select user_id, role, status from venture_memberships where venture_id = ${ventureId}`;
    expect(members).toEqual([{ user_id: owner, role: "owner", status: "active" }]);
    const [o] =
      await admin`select current_step, completed_at, updated_by from venture_onboarding where venture_id = ${ventureId}`;
    expect(o).toMatchObject({ current_step: "business", completed_at: null, updated_by: owner });
    const audit =
      await admin`select action, actor_user_id, correlation_id from audit_log where venture_id = ${ventureId}`;
    expect(audit).toEqual([
      { action: "venture.created", actor_user_id: owner, correlation_id: "corr-create-0001" },
    ]);
  });

  it("leaves nothing behind when creation fails", async () => {
    const owner = await newUser("fails");
    await expectPgError(createVenture(owner, "   "), "23514");
    await expectPgError(
      withUser({ userId: owner }, (tx) =>
        tx.execute(
          sql`select app.create_venture('Bad TZ', null, null, 'GB', 'GBP', 'Mars/Olympus')`,
        ),
      ),
      "DXV05",
    );
    expect(await admin`select 1 from ventures where created_by = ${owner}`).toHaveLength(0);
    expect(await admin`select 1 from venture_memberships where user_id = ${owner}`).toHaveLength(0);
  });

  it("is idempotent for a repeated request id", async () => {
    const owner = await newUser("retry");
    const requestId = randomUUID();
    const [a, b] = await Promise.all([
      createVenture(owner, "Retry Co", requestId),
      createVenture(owner, "Retry Co", requestId),
    ]);
    expect(a).toBe(b);
    expect(await admin`select 1 from ventures where created_by = ${owner}`).toHaveLength(1);
    expect(
      await admin`select 1 from audit_log where venture_id = ${a} and action = 'venture.created'`,
    ).toHaveLength(1);
  });

  it("limits open drafts per user", async () => {
    const owner = await newUser("drafty");
    for (let i = 0; i < 5; i++) await createVenture(owner, `Draft ${i}`);
    await expectPgError(createVenture(owner, "One too many"), "DXV01");
  });
});

describe("onboarding state isolation", () => {
  it("is visible only within its own venture context", async () => {
    const owner = await newUser("iso");
    const ventureId = await createVenture(owner);
    const own = await withTenant({ userId: owner, ventureId }, (tx) =>
      tx.select().from(ventureOnboarding),
    );
    expect(own.map((r) => r.ventureId)).toEqual([ventureId]);

    const fromAlice = await withTenant({ userId: f.user.alice, ventureId: f.ventureA }, (tx) =>
      tx.select().from(ventureOnboarding).where(eq(ventureOnboarding.ventureId, ventureId)),
    );
    expect(fromAlice).toEqual([]);
    // Forging the other venture into the context does not help a non-member.
    const forged = await withTenant({ userId: f.user.alice, ventureId }, (tx) =>
      tx.select().from(ventureOnboarding),
    );
    expect(forged).toEqual([]);
  });

  it("cannot be modified from another venture or by a forged context", async () => {
    const owner = await newUser("iso-w");
    const ventureId = await createVenture(owner);
    for (const ctx of [
      { userId: f.user.alice, ventureId: f.ventureA },
      { userId: f.user.alice, ventureId },
    ]) {
      const rows = await withTenant(ctx, (tx) =>
        tx
          .update(ventureOnboarding)
          .set({ businessCompletedAt: new Date(), updatedBy: f.user.alice })
          .where(eq(ventureOnboarding.ventureId, ventureId))
          .returning(),
      );
      expect(rows).toEqual([]);
    }
    const [o] =
      await admin`select business_completed_at from venture_onboarding where venture_id = ${ventureId}`;
    expect(o!.business_completed_at).toBeNull();
  });

  it("is writable by the Owner only, never by other roles", async () => {
    // Venture A: alice owner, dave admin, erin manager.
    await admin`insert into venture_onboarding (venture_id, updated_by) values (${f.ventureA}, ${f.user.alice})`;
    for (const userId of [f.user.dave, f.user.erin, f.user.carol]) {
      const rows = await withTenant({ userId, ventureId: f.ventureA }, (tx) =>
        tx
          .update(ventureOnboarding)
          .set({ businessCompletedAt: new Date(), updatedBy: userId })
          .where(eq(ventureOnboarding.ventureId, f.ventureA))
          .returning(),
      );
      expect(rows).toEqual([]);
    }
    const byOwner = await withTenant({ userId: f.user.alice, ventureId: f.ventureA }, (tx) =>
      tx
        .update(ventureOnboarding)
        .set({ businessCompletedAt: new Date(), updatedBy: f.user.alice })
        .where(eq(ventureOnboarding.ventureId, f.ventureA))
        .returning(),
    );
    expect(byOwner).toHaveLength(1);
  });

  it("does not let the runtime role set completion columns or impersonate updated_by", async () => {
    const owner = await newUser("cols");
    const ventureId = await createVenture(owner);
    await expectPgError(
      withTenant({ userId: owner, ventureId }, (tx) =>
        tx
          .update(ventureOnboarding)
          .set({ completedAt: new Date() })
          .where(eq(ventureOnboarding.ventureId, ventureId)),
      ),
      RLS_VIOLATION,
      "permission denied",
    );
    await expectPgError(
      withTenant({ userId: owner, ventureId }, (tx) =>
        tx
          .update(ventureOnboarding)
          .set({ businessCompletedAt: new Date(), updatedBy: f.user.alice })
          .where(eq(ventureOnboarding.ventureId, ventureId)),
      ),
      RLS_VIOLATION,
      "row-level security",
    );
  });

  it("enforces step order", async () => {
    const owner = await newUser("order");
    const ventureId = await createVenture(owner);
    await expectPgError(
      withTenant({ userId: owner, ventureId }, (tx) =>
        tx
          .update(ventureOnboarding)
          .set({ dataConnectionsCompletedAt: new Date(), updatedBy: owner })
          .where(eq(ventureOnboarding.ventureId, ventureId)),
      ),
      "23514",
    );
  });
});

describe("venture lifecycle", () => {
  it("the runtime role cannot write status at all", async () => {
    const owner = await newUser("status");
    const ventureId = await createVenture(owner);
    await expectPgError(
      withTenant({ userId: owner, ventureId }, (tx) =>
        tx.update(ventures).set({ status: "active" }).where(eq(ventures.id, ventureId)),
      ),
      RLS_VIOLATION,
      "permission denied",
    );
  });

  it("even a superuser cannot activate a venture whose onboarding is incomplete", async () => {
    const owner = await newUser("trigger");
    const ventureId = await createVenture(owner);
    await expectPgError(
      admin`update ventures set status = 'active' where id = ${ventureId}`,
      "DXV04",
    );
    await expectPgError(
      admin`update ventures set status = 'suspended' where id = ${ventureId}`,
      "DXV04",
    );
  });
});

describe("app.complete_venture_onboarding", () => {
  it("rejects incomplete onboarding and leaves the venture draft", async () => {
    const owner = await newUser("incomplete");
    const ventureId = await createVenture(owner);
    await expectPgError(complete(owner, ventureId), "DXV02");
    const [v] = await admin`select status from ventures where id = ${ventureId}`;
    expect(v!.status).toBe("draft");
  });

  it("revalidates settings and rolls back entirely on failure", async () => {
    const owner = await newUser("invalid");
    const ventureId = await createVenture(owner);
    await prepareForCompletion(ventureId, owner);
    await admin`update ventures set sector = null where id = ${ventureId}`;
    await expectPgError(complete(owner, ventureId), "DXV05", "sector");
    const [v] = await admin`select status from ventures where id = ${ventureId}`;
    const [o] =
      await admin`select completed_at, review_completed_at from venture_onboarding where venture_id = ${ventureId}`;
    expect(v!.status).toBe("draft");
    expect(o).toEqual({ completed_at: null, review_completed_at: null });
    expect(
      await admin`select 1 from audit_log where venture_id = ${ventureId} and action = 'venture.activated'`,
    ).toHaveLength(0);
  });

  it("refuses non-owners, other ventures, forged contexts and removed owners identically", async () => {
    const owner = await newUser("authz");
    const ventureId = await createVenture(owner);
    await prepareForCompletion(ventureId, owner);
    await expectPgError(complete(f.user.alice, ventureId), "DXV03");
    await expectPgError(complete(owner, ventureId, f.ventureA), "DXV03");
    await expectPgError(complete(f.user.alice, randomUUID()), "DXV03");

    await forceOwnerMembershipStatus(admin, ventureId, "suspended");
    await expectPgError(complete(owner, ventureId), "DXV03");
    await forceOwnerMembershipStatus(admin, ventureId, "active");
  });

  it("completes onboarding and activates the venture atomically, with audit records", async () => {
    const owner = await newUser("done");
    const ventureId = await createVenture(owner);
    await prepareForCompletion(ventureId, owner);
    await complete(owner, ventureId);

    const [v] = await admin`select status from ventures where id = ${ventureId}`;
    const [o] = await admin`select current_step, completed_at, review_completed_at, updated_by
                            from venture_onboarding where venture_id = ${ventureId}`;
    expect(v!.status).toBe("active");
    expect(o).toMatchObject({ current_step: "completed", updated_by: owner });
    expect(o!.completed_at).not.toBeNull();
    const actions =
      await admin`select action from audit_log where venture_id = ${ventureId} order by occurred_at, action`;
    expect(actions.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        "venture.created",
        "venture.onboarding.completed",
        "venture.activated",
      ]),
    );

    // Not repeatable, and onboarding is now immutable for the runtime role.
    await expectPgError(complete(owner, ventureId), "DXV04");
    const rows = await withTenant({ userId: owner, ventureId }, (tx) =>
      tx
        .update(ventureOnboarding)
        .set({ currentStep: "business", updatedBy: owner })
        .where(eq(ventureOnboarding.ventureId, ventureId))
        .returning(),
    );
    expect(rows).toEqual([]);
  });
});
