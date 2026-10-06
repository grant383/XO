import { eq } from "drizzle-orm";
import postgres from "postgres";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools, schema, withService, withTenant, withUser } from "@/platform/db";
import { adminSql, expectPgError, RLS_VIOLATION, seedTwoVentures } from "../helpers/db";

const { auditLog } = schema;

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

describe("audit_log writes", () => {
  it("records account-level events (venture_id NULL) for the acting user", async () => {
    await withUser({ userId: f.user.alice }, (tx) =>
      tx.insert(auditLog).values({
        actorType: "user",
        actorUserId: f.user.alice,
        subjectUserId: f.user.alice,
        action: "auth.mfa.enabled",
      }),
    );
  });

  it("rejects a spoofed actor", async () => {
    await expectPgError(
      withUser({ userId: f.user.alice }, (tx) =>
        tx
          .insert(auditLog)
          .values({ actorType: "user", actorUserId: f.user.bob, action: "auth.login" }),
      ),
      RLS_VIOLATION,
      "row-level security",
    );
  });

  it("records venture events only inside the active venture", async () => {
    await withTenant({ userId: f.user.alice, ventureId: f.ventureA }, (tx) =>
      tx.insert(auditLog).values({
        ventureId: f.ventureA,
        actorType: "user",
        actorUserId: f.user.alice,
        action: "venture.updated",
      }),
    );
    await expectPgError(
      withTenant({ userId: f.user.alice, ventureId: f.ventureA }, (tx) =>
        tx.insert(auditLog).values({
          ventureId: f.ventureB,
          actorType: "user",
          actorUserId: f.user.alice,
          action: "venture.updated",
        }),
      ),
      RLS_VIOLATION,
    );
  });

  it("records service events with the job's own identity", async () => {
    await withService({ serviceId: "worker:audit-test", ventureId: f.ventureA }, (tx) =>
      tx.insert(auditLog).values({
        ventureId: f.ventureA,
        actorType: "service",
        actorService: "worker:audit-test",
        action: "sync.completed",
      }),
    );
    await expectPgError(
      withService({ serviceId: "worker:audit-test", ventureId: f.ventureA }, (tx) =>
        tx.insert(auditLog).values({
          ventureId: f.ventureA,
          actorType: "service",
          actorService: "worker:other",
          action: "sync.completed",
        }),
      ),
      RLS_VIOLATION,
    );
  });

  it("lets the identity-store role write account-level events only", async () => {
    const authUrl = process.env.AUTH_DATABASE_URL!;
    const auth = postgres(authUrl, { max: 1, onnotice: () => {} });
    try {
      await auth`insert into audit_log (actor_type, action, metadata) values ('anonymous', 'auth.login.failed', '{"reason":"unknown_email"}')`;
      await expectPgError(
        auth`insert into audit_log (venture_id, actor_type, actor_user_id, action) values (${f.ventureA}, 'user', ${f.user.alice}, 'venture.updated')`,
        RLS_VIOLATION,
      );
      await expectPgError(auth`select * from audit_log`, RLS_VIOLATION, "permission denied");
      await expectPgError(
        auth`select * from venture_memberships`,
        RLS_VIOLATION,
        "permission denied",
      );
    } finally {
      await auth.end();
    }
  });
});

describe("audit_log reads", () => {
  it("shows venture events to Owner/Admin of that venture only", async () => {
    const ownerRows = await withTenant({ userId: f.user.alice, ventureId: f.ventureA }, (tx) =>
      tx.select().from(auditLog).where(eq(auditLog.ventureId, f.ventureA)),
    );
    expect(ownerRows.length).toBeGreaterThanOrEqual(2);

    const viewerRows = await withTenant({ userId: f.user.carol, ventureId: f.ventureA }, (tx) =>
      tx.select().from(auditLog).where(eq(auditLog.ventureId, f.ventureA)),
    );
    expect(viewerRows).toEqual([]);

    const otherOwner = await withTenant({ userId: f.user.bob, ventureId: f.ventureB }, (tx) =>
      tx.select().from(auditLog).where(eq(auditLog.ventureId, f.ventureA)),
    );
    expect(otherOwner).toEqual([]);
  });

  it("shows account-level events only to the user they concern", async () => {
    const mine = await withUser({ userId: f.user.alice }, (tx) => tx.select().from(auditLog));
    expect(mine.some((r) => r.action === "auth.mfa.enabled")).toBe(true);

    const bobs = await withUser({ userId: f.user.bob }, (tx) => tx.select().from(auditLog));
    expect(bobs.some((r) => r.subjectUserId === f.user.alice)).toBe(false);
  });
});

describe("audit_log immutability", () => {
  it("has no UPDATE/DELETE privilege for the runtime role", async () => {
    await expectPgError(
      withUser({ userId: f.user.alice }, (tx) => tx.update(auditLog).set({ action: "tampered" })),
      RLS_VIOLATION,
      "permission denied",
    );
    await expectPgError(
      withUser({ userId: f.user.alice }, (tx) => tx.delete(auditLog)),
      RLS_VIOLATION,
      "permission denied",
    );
  });

  it("rejects UPDATE, DELETE and TRUNCATE even for privileged roles", async () => {
    await expectPgError(
      admin`update audit_log set action = 'tampered'`,
      RLS_VIOLATION,
      "append-only",
    );
    await expectPgError(admin`delete from audit_log`, RLS_VIOLATION, "append-only");
    const before = await admin`select count(*)::int as count from audit_log`;
    // The inbox projection now references audit rows. Prove both the FK guard and
    // append-only trigger; CASCADE reaches the trigger without weakening integrity.
    await expectPgError(admin`truncate audit_log`, "0A000", "foreign key");
    await expectPgError(admin`truncate audit_log cascade`, RLS_VIOLATION, "append-only");
    expect(await admin`select count(*)::int as count from audit_log`).toEqual(before);
  });
});
