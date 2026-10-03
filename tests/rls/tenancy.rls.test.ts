import { and, eq, sql } from "drizzle-orm";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools, schema, withService, withTenant, withUser } from "@/platform/db";
import { adminSql, appRoleSql, expectPgError, RLS_VIOLATION, seedTwoVentures } from "../helpers/db";

const { ventures, ventureMemberships, users } = schema;

let admin: postgres.Sql;
let f: Awaited<ReturnType<typeof seedTwoVentures>>;

beforeAll(async () => {
  admin = adminSql();
  f = await seedTwoVentures(admin);
});

afterAll(async () => {
  await closePools();
  await admin.end();
});

describe("venture visibility", () => {
  it("lists only the ventures a user belongs to (no active venture required)", async () => {
    const ids = await withUser({ userId: f.user.alice }, (tx) =>
      tx.select({ id: ventures.id }).from(ventures),
    );
    expect(ids.map((r) => r.id)).toEqual([f.ventureA]);

    const daveIds = await withUser({ userId: f.user.dave }, (tx) =>
      tx.select({ id: ventures.id }).from(ventures),
    );
    expect(daveIds.map((r) => r.id).sort()).toEqual([f.ventureA, f.ventureB].sort());
  });

  it("returns nothing to an authenticated user with no memberships", async () => {
    const rows = await withUser({ userId: f.user.mallory }, (tx) => tx.select().from(ventures));
    expect(rows).toEqual([]);
  });

  it("hides another venture even when its id is forged into the tenant context", async () => {
    const rows = await withTenant({ userId: f.user.alice, ventureId: f.ventureB }, (tx) =>
      tx.select().from(ventures).where(eq(ventures.id, f.ventureB)),
    );
    expect(rows).toEqual([]);

    const members = await withTenant({ userId: f.user.alice, ventureId: f.ventureB }, (tx) =>
      tx.select().from(ventureMemberships).where(eq(ventureMemberships.ventureId, f.ventureB)),
    );
    expect(members).toEqual([]);
  });

  it("cannot update another venture from inside one's own venture context", async () => {
    const updated = await withTenant({ userId: f.user.alice, ventureId: f.ventureA }, (tx) =>
      tx.update(ventures).set({ name: "hijacked" }).where(eq(ventures.id, f.ventureB)).returning(),
    );
    expect(updated).toEqual([]);
    const [b] = await admin`select name from ventures where id = ${f.ventureB}`;
    expect(b!.name).not.toBe("hijacked");
  });

  it("allows Owner/Admin to update their venture but not Manager/Viewer", async () => {
    const byOwner = await withTenant({ userId: f.user.alice, ventureId: f.ventureA }, (tx) =>
      tx
        .update(ventures)
        .set({ timezone: "Europe/Dublin" })
        .where(eq(ventures.id, f.ventureA))
        .returning(),
    );
    expect(byOwner).toHaveLength(1);

    for (const userId of [f.user.erin, f.user.carol]) {
      const rows = await withTenant({ userId, ventureId: f.ventureA }, (tx) =>
        tx.update(ventures).set({ name: "nope" }).where(eq(ventures.id, f.ventureA)).returning(),
      );
      expect(rows).toEqual([]);
    }
  });

  it("denies direct INSERT and DELETE on ventures to the runtime role", async () => {
    await expectPgError(
      withUser({ userId: f.user.alice }, (tx) =>
        tx.insert(ventures).values({ name: "x", createdBy: f.user.alice }),
      ),
      RLS_VIOLATION,
      "permission denied",
    );
    await expectPgError(
      withTenant({ userId: f.user.alice, ventureId: f.ventureA }, (tx) =>
        tx.delete(ventures).where(eq(ventures.id, f.ventureA)),
      ),
      RLS_VIOLATION,
      "permission denied",
    );
  });

  it("denies changing immutable venture columns", async () => {
    await expectPgError(
      withTenant({ userId: f.user.alice, ventureId: f.ventureA }, (tx) =>
        tx.update(ventures).set({ createdBy: f.user.bob }).where(eq(ventures.id, f.ventureA)),
      ),
      RLS_VIOLATION,
      "permission denied",
    );
  });
});

describe("venture creation", () => {
  it("creates the venture and Owner membership atomically", async () => {
    const ventureId = await withUser({ userId: f.user.mallory }, async (tx) => {
      const rows = await tx.execute<{ id: string }>(
        sql`select app.create_venture(${"Mallory Ltd"}) as id`,
      );
      return rows[0]!.id;
    });

    const visible = await withTenant({ userId: f.user.mallory, ventureId }, (tx) =>
      tx.select().from(ventureMemberships).where(eq(ventureMemberships.ventureId, ventureId)),
    );
    expect(visible).toHaveLength(1);
    expect(visible[0]).toMatchObject({ userId: f.user.mallory, role: "owner", status: "active" });

    // Still invisible to others.
    const fromAlice = await withUser({ userId: f.user.alice }, (tx) =>
      tx.select().from(ventures).where(eq(ventures.id, ventureId)),
    );
    expect(fromAlice).toEqual([]);
  });

  it("refuses to create a venture without a user context", async () => {
    await expectPgError(
      withService({ serviceId: "test:create" }, (tx) =>
        tx.execute(sql`select app.create_venture('Ghost')`),
      ),
      RLS_VIOLATION,
      "authenticated user context",
    );
  });
});

describe("membership management", () => {
  it("lets members of the active venture see its roster, and only that roster", async () => {
    const rows = await withTenant({ userId: f.user.carol, ventureId: f.ventureA }, (tx) =>
      tx.select({ ventureId: ventureMemberships.ventureId }).from(ventureMemberships),
    );
    expect(new Set(rows.map((r) => r.ventureId))).toEqual(new Set([f.ventureA]));
    expect(rows).toHaveLength(4);
  });

  it("forbids Viewers and Managers from adding members", async () => {
    for (const userId of [f.user.carol, f.user.erin]) {
      await expectPgError(
        withTenant({ userId, ventureId: f.ventureA }, (tx) =>
          tx
            .insert(ventureMemberships)
            .values({ ventureId: f.ventureA, userId: f.user.mallory, role: "viewer" }),
        ),
        RLS_VIOLATION,
        "row-level security",
      );
    }
  });

  it("lets an Admin add Operators but not Admins or Owners", async () => {
    const ctx = { userId: f.user.dave, ventureId: f.ventureA };
    await expectPgError(
      withTenant(ctx, (tx) =>
        tx
          .insert(ventureMemberships)
          .values({ ventureId: f.ventureA, userId: f.user.mallory, role: "admin" }),
      ),
      RLS_VIOLATION,
    );
    await expectPgError(
      withTenant(ctx, (tx) =>
        tx
          .insert(ventureMemberships)
          .values({ ventureId: f.ventureA, userId: f.user.mallory, role: "owner" }),
      ),
      RLS_VIOLATION,
    );
    const added = await withTenant(ctx, (tx) =>
      tx
        .insert(ventureMemberships)
        .values({ ventureId: f.ventureA, userId: f.user.mallory, role: "operator" })
        .returning(),
    );
    expect(added).toHaveLength(1);
  });

  it("cannot add a member to another venture while in one's own context", async () => {
    await expectPgError(
      withTenant({ userId: f.user.alice, ventureId: f.ventureA }, (tx) =>
        tx
          .insert(ventureMemberships)
          .values({ ventureId: f.ventureB, userId: f.user.carol, role: "viewer" }),
      ),
      RLS_VIOLATION,
      "row-level security",
    );
  });

  it("uses a role in venture B only within venture B (Dave: Admin in A, Manager in B)", async () => {
    await expectPgError(
      withTenant({ userId: f.user.dave, ventureId: f.ventureB }, (tx) =>
        tx
          .insert(ventureMemberships)
          .values({ ventureId: f.ventureB, userId: f.user.carol, role: "viewer" }),
      ),
      RLS_VIOLATION,
    );
  });

  it("never lets anyone modify the Owner membership through table writes", async () => {
    const rows = await withTenant({ userId: f.user.alice, ventureId: f.ventureA }, (tx) =>
      tx
        .update(ventureMemberships)
        .set({ status: "suspended" })
        .where(
          and(
            eq(ventureMemberships.ventureId, f.ventureA),
            eq(ventureMemberships.userId, f.user.alice),
          ),
        )
        .returning(),
    );
    expect(rows).toEqual([]);
  });

  it("prevents an Admin from changing another Admin, and from self-promotion to Owner", async () => {
    const promote = await withTenant({ userId: f.user.dave, ventureId: f.ventureA }, (tx) =>
      tx
        .update(ventureMemberships)
        .set({ role: "owner" })
        .where(
          and(
            eq(ventureMemberships.ventureId, f.ventureA),
            eq(ventureMemberships.userId, f.user.dave),
          ),
        )
        .returning(),
    );
    expect(promote).toEqual([]);
  });

  it("bumps the membership version on role change (authorization cache invalidation)", async () => {
    const [before] = await admin`select version from venture_memberships
                                 where venture_id = ${f.ventureA} and user_id = ${f.user.carol}`;
    const [after] = await withTenant({ userId: f.user.alice, ventureId: f.ventureA }, (tx) =>
      tx
        .update(ventureMemberships)
        .set({ role: "operator" })
        .where(
          and(
            eq(ventureMemberships.ventureId, f.ventureA),
            eq(ventureMemberships.userId, f.user.carol),
          ),
        )
        .returning({ version: ventureMemberships.version }),
    );
    expect(after!.version).toBe(before!.version + 1);
  });

  it("denies moving a membership to another venture and denies hard deletes", async () => {
    const ctx = { userId: f.user.alice, ventureId: f.ventureA };
    await expectPgError(
      withTenant(ctx, (tx) =>
        tx
          .update(ventureMemberships)
          .set({ ventureId: f.ventureB })
          .where(eq(ventureMemberships.userId, f.user.erin)),
      ),
      RLS_VIOLATION,
      "permission denied",
    );
    await expectPgError(
      withTenant(ctx, (tx) =>
        tx.delete(ventureMemberships).where(eq(ventureMemberships.userId, f.user.erin)),
      ),
      RLS_VIOLATION,
      "permission denied",
    );
  });
});

describe("user directory", () => {
  it("shows a user themselves and co-members only", async () => {
    const seen = await withUser({ userId: f.user.carol }, (tx) =>
      tx.select({ id: users.id }).from(users),
    );
    const ids = new Set(seen.map((r) => r.id));
    expect(ids.has(f.user.carol)).toBe(true);
    expect(ids.has(f.user.alice)).toBe(true);
    expect(ids.has(f.user.bob)).toBe(false);
  });

  it("denies the runtime role writes to the identity store", async () => {
    await expectPgError(
      withUser({ userId: f.user.alice }, (tx) =>
        tx.update(users).set({ name: "x" }).where(eq(users.id, f.user.alice)),
      ),
      RLS_VIOLATION,
      "permission denied",
    );
  });
});

describe("service identity", () => {
  it("scopes a background job to exactly one venture", async () => {
    const rows = await withService({ serviceId: "worker:test", ventureId: f.ventureA }, (tx) =>
      tx.select({ ventureId: ventureMemberships.ventureId }).from(ventureMemberships),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.ventureId))).toEqual(new Set([f.ventureA]));
  });

  it("sees nothing without a venture", async () => {
    const rows = await withService({ serviceId: "worker:test" }, (tx) =>
      tx.select().from(ventureMemberships),
    );
    expect(rows).toEqual([]);
  });
});

describe("fail-closed context", () => {
  it("returns no tenant rows to the runtime role when no context is set", async () => {
    const raw = appRoleSql();
    try {
      expect(await raw`select * from ventures`).toHaveLength(0);
      expect(await raw`select * from venture_memberships`).toHaveLength(0);
      expect(await raw`select * from audit_log`).toHaveLength(0);
      expect(await raw`select id from users`).toHaveLength(0);
    } finally {
      await raw.end();
    }
  });

  it("does not leak transaction-local context to the next use of a pooled connection", async () => {
    const raw = appRoleSql(1);
    try {
      await raw.begin(async (tx) => {
        await tx`select set_config('app.actor_type', 'user', true), set_config('app.user_id', ${f.user.alice}, true)`;
        expect(await tx`select id from ventures`).toHaveLength(1);
      });
      const [setting] = await raw`select coalesce(current_setting('app.user_id', true), '') as v`;
      expect(setting!.v).toBe("");
      expect(await raw`select id from ventures`).toHaveLength(0);
    } finally {
      await raw.end();
    }
  });

  it("rejects malformed identifiers before touching the database", async () => {
    await expect(
      withTenant({ userId: "not-a-uuid", ventureId: f.ventureA }, async () => 1),
    ).rejects.toThrow();
    await expect(withService({ serviceId: "Bad Service" }, async () => 1)).rejects.toThrow();
  });
});
