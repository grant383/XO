import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getInbox, getVentureActivity, markNotificationsRead } from "@/modules/notifications";
import { closePools, withTenant, withUser } from "@/platform/db";
import { adminSql, expectPgError, seedTwoVentures } from "../helpers/db";
import { activateVenture } from "../helpers/memberships";
let admin: Sql;
let fixture: Awaited<ReturnType<typeof seedTwoVentures>>;
beforeAll(async () => {
  admin = adminSql();
  fixture = await seedTwoVentures(admin);
});
afterAll(async () => {
  await closePools();
  await admin.end();
});

const event = async (userId: string, action: string, occurredAt = new Date()) => {
  const id = randomUUID();
  await admin`insert into audit_log (id, actor_type, actor_user_id, subject_user_id, action, occurred_at, metadata) values (${id}, 'user', ${userId}, ${userId}, ${action}, ${occurredAt}, '{"token":"do-not-return"}')`;
  return id;
};
describe("notifications and audit activity", () => {
  it("projects an account event exactly once without copying sensitive metadata", async () => {
    const auditId = await event(fixture.user.alice, "auth.password.changed");
    const inbox = await getInbox({ userId: fixture.user.alice });
    expect(inbox.items).toHaveLength(1);
    expect(inbox.unread).toBe(1);
    expect(inbox.total).toBe(1);
    expect(JSON.stringify(inbox)).not.toContain("do-not-return");
    expect(
      await admin`select count(*)::integer as count from notifications where audit_event_id = ${auditId}`,
    ).toEqual([{ count: 1 }]);
  });
  it("cannot read or mark another account's inbox, even with venture admin permissions", async () => {
    await event(fixture.user.carol, "auth.login.succeeded");
    const inbox = await getInbox({ userId: fixture.user.carol });
    const id = inbox.items[0]!.id;
    expect((await getInbox({ userId: fixture.user.dave })).items).toHaveLength(0);
    expect(
      await markNotificationsRead(
        { userId: fixture.user.dave },
        { id, through: new Date().toISOString() },
      ),
    ).toEqual({ updated: 0 });
    const rows = await withUser({ userId: fixture.user.dave }, (tx) =>
      tx.execute(sql`select * from notifications where user_id = ${fixture.user.carol}`),
    );
    expect(rows).toHaveLength(0);
    await expectPgError(
      withUser({ userId: fixture.user.dave }, (tx) =>
        tx.execute(sql`update notifications set user_id = ${fixture.user.dave} where id = ${id}`),
      ),
      "42501",
    );
  });
  it("marks only notifications through the displayed cutoff and tolerates retries", async () => {
    const userId = fixture.user.bob;
    await event(userId, "auth.login.succeeded", new Date(Date.now() - 1000));
    const inbox = await getInbox({ userId });
    await event(userId, "auth.session.created", new Date(Date.now() + 100));
    expect(await markNotificationsRead({ userId }, { through: inbox.asOf })).toEqual({
      updated: 1,
    });
    expect(await markNotificationsRead({ userId }, { through: inbox.asOf })).toEqual({
      updated: 0,
    });
    expect((await getInbox({ userId }, { unread: true })).items).toHaveLength(1);
    await expect(
      markNotificationsRead({ userId }, { through: new Date(Date.now() + 60000).toISOString() }),
    ).rejects.toThrow("cutoff");
  });
  it("leaves venture audit events under venture RLS, rechecking role and membership", async () => {
    const f = fixture;
    await activateVenture(admin, f.ventureA);
    await activateVenture(admin, f.ventureB);
    const eventId = randomUUID();
    await admin`insert into audit_log (id, venture_id, actor_type, actor_user_id, action) values (${eventId}, ${f.ventureA}, 'user', ${f.user.alice}, 'venture.membership.created')`;
    expect(
      (await getInbox({ userId: f.user.alice })).items.some(
        (r) => r.action === "venture.membership.created",
      ),
    ).toBe(false);
    expect(
      (await getVentureActivity({ userId: f.user.alice }, f.ventureA)).some(
        (r) => r.id === eventId,
      ),
    ).toBe(true);
    expect(
      (await getVentureActivity({ userId: f.user.dave }, f.ventureA)).some((r) => r.id === eventId),
    ).toBe(true);
    for (const userId of [f.user.carol, f.user.bob, f.user.mallory])
      await expect(getVentureActivity({ userId }, f.ventureA)).rejects.toThrow();
    await admin`update venture_memberships set role = 'viewer' where user_id = ${f.user.dave} and venture_id = ${f.ventureA}`;
    await expect(getVentureActivity({ userId: f.user.dave }, f.ventureA)).rejects.toThrow();
    const rows = await withTenant({ userId: f.user.dave, ventureId: f.ventureA }, (tx) =>
      tx.execute(sql`select * from audit_log where id = ${eventId}`),
    );
    expect(rows).toHaveLength(0);
  });
});
