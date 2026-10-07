import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools, schema, withService, withTenant, withUser } from "@/platform/db";
import { adminSql, expectPgError, RLS_VIOLATION, seedTwoVentures } from "../helpers/db";
import { activateVenture } from "../helpers/memberships";

/**
 * Database-level guarantees for Command Centre tasks (migration 0014). They hold whatever
 * the application does: venture isolation, Viewer read-only, no actor spoofing, status-only
 * updates and no deletes.
 *
 * Venture A: alice (owner), dave (admin), erin (manager), carol (viewer); B: bob, dave.
 */
const { commandTasks } = schema;
let admin: Sql;
let f: Awaited<ReturnType<typeof seedTwoVentures>>;
let taskA: string;
let taskB: string;

const ctx = (userId: string, ventureId: string) => ({ userId, ventureId });

async function seedTask(ventureId: string, createdBy: string, title: string) {
  const [row] = await admin<{ id: string }[]>`
    insert into command_tasks (venture_id, request_id, title, priority, created_by)
    values (${ventureId}, ${randomUUID()}, ${title}, 'high', ${createdBy}) returning id`;
  return row!.id;
}

const insertAs = (userId: string, ventureId: string, extra: Record<string, unknown> = {}) =>
  withTenant(ctx(userId, ventureId), (tx) =>
    tx.insert(commandTasks).values({
      ventureId,
      requestId: randomUUID(),
      title: "Inserted",
      priority: "low",
      createdBy: userId,
      ...extra,
    }),
  );

beforeAll(async () => {
  admin = adminSql();
  f = await seedTwoVentures(admin);
  await activateVenture(admin, f.ventureA);
  await activateVenture(admin, f.ventureB);
  taskA = await seedTask(f.ventureA, f.user.alice, "A task");
  taskB = await seedTask(f.ventureB, f.user.bob, "B task");
});
afterAll(async () => {
  await closePools();
  await admin.end();
});

describe("command_tasks privileges", () => {
  it("grants the runtime role status-only updates and no deletes", async () => {
    const [p] = await admin`
      select has_table_privilege('dxo_app', 'command_tasks', 'DELETE') as del,
             has_column_privilege('dxo_app', 'command_tasks', 'title', 'UPDATE') as title_upd,
             has_column_privilege('dxo_app', 'command_tasks', 'venture_id', 'UPDATE') as venture_upd,
             has_column_privilege('dxo_app', 'command_tasks', 'status', 'UPDATE') as status_upd,
             has_table_privilege('dxo_auth', 'command_tasks', 'SELECT') as auth_sel`;
    expect(p).toEqual({
      del: false,
      title_upd: false,
      venture_upd: false,
      status_upd: true,
      auth_sel: false,
    });
  });
});

describe("command_tasks isolation", () => {
  it("shows each member only the venture in context", async () => {
    const titles = (userId: string, ventureId: string) =>
      withTenant(ctx(userId, ventureId), (tx) =>
        tx.select({ title: commandTasks.title }).from(commandTasks),
      ).then((rows) => rows.map((r) => r.title));
    expect(await titles(f.user.carol, f.ventureA)).toContain("A task");
    expect(await titles(f.user.carol, f.ventureA)).not.toContain("B task");
    // Dave belongs to both ventures; context decides which one he sees.
    expect(await titles(f.user.dave, f.ventureB)).toEqual(["B task"]);
    // Non-members and members naming a venture they are not in see nothing.
    expect(await titles(f.user.mallory, f.ventureA)).toEqual([]);
    expect(await titles(f.user.carol, f.ventureB)).toEqual([]);
  });

  it("fails closed without a venture context or for an unscoped service", async () => {
    expect(
      await withUser({ userId: f.user.alice }, (tx) => tx.select().from(commandTasks)),
    ).toEqual([]);
    expect(
      await withService({ serviceId: "worker:test" }, (tx) => tx.select().from(commandTasks)),
    ).toEqual([]);
  });

  it("cannot update another venture's task by id", async () => {
    const updated = await withTenant(ctx(f.user.dave, f.ventureA), (tx) =>
      tx
        .update(commandTasks)
        .set({ status: "done", statusChangedAt: new Date(), statusChangedBy: f.user.dave })
        .where(eq(commandTasks.id, taskB))
        .returning({ id: commandTasks.id }),
    );
    expect(updated).toEqual([]);
    const [row] = await admin<
      { status: string }[]
    >`select status from command_tasks where id = ${taskB}`;
    expect(row!.status).toBe("open");
  });

  it("rejects writing a row into another venture", async () => {
    await expectPgError(
      insertAs(f.user.alice, f.ventureA, { ventureId: f.ventureB }),
      RLS_VIOLATION,
    );
  });
});

describe("command_tasks role rules", () => {
  it("lets Manager+ insert and refuses a Viewer", async () => {
    await insertAs(f.user.erin, f.ventureA);
    await expectPgError(insertAs(f.user.carol, f.ventureA), RLS_VIOLATION);
  });

  it("refuses spoofed authors and pre-completed rows", async () => {
    await expectPgError(
      insertAs(f.user.erin, f.ventureA, { createdBy: f.user.alice }),
      RLS_VIOLATION,
    );
    await expectPgError(
      insertAs(f.user.erin, f.ventureA, {
        status: "done",
        statusChangedAt: new Date(),
        statusChangedBy: f.user.erin,
      }),
      RLS_VIOLATION,
    );
  });

  it("lets a Viewer update nothing and nobody record another person as the changer", async () => {
    const viewerUpdate = await withTenant(ctx(f.user.carol, f.ventureA), (tx) =>
      tx
        .update(commandTasks)
        .set({ status: "done", statusChangedAt: new Date(), statusChangedBy: f.user.carol })
        .where(eq(commandTasks.id, taskA))
        .returning({ id: commandTasks.id }),
    );
    expect(viewerUpdate).toEqual([]);
    await expectPgError(
      withTenant(ctx(f.user.erin, f.ventureA), (tx) =>
        tx
          .update(commandTasks)
          .set({ status: "done", statusChangedAt: new Date(), statusChangedBy: f.user.alice })
          .where(eq(commandTasks.id, taskA)),
      ),
      RLS_VIOLATION,
    );
  });

  it("forbids deleting and editing the title even for the Owner", async () => {
    await expectPgError(
      withTenant(ctx(f.user.alice, f.ventureA), (tx) =>
        tx.delete(commandTasks).where(eq(commandTasks.id, taskA)),
      ),
      RLS_VIOLATION,
    );
    await expectPgError(
      withTenant(ctx(f.user.alice, f.ventureA), (tx) =>
        tx.execute(sql`update command_tasks set title = 'Changed' where id = ${taskA}`),
      ),
      RLS_VIOLATION,
    );
  });
});
