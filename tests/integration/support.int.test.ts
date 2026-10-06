import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupportRequest, listSupportRequests } from "@/modules/support";
import { closePools, withUser } from "@/platform/db";
import { sql } from "drizzle-orm";
import { adminSql, seedTwoVentures, expectPgError } from "../helpers/db";

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

describe("account-owned support requests", () => {
  it("persists once on retries, atomically audits, and rejects a conflicting retry", async () => {
    const actor = { userId: fixture.user.alice, correlationId: randomUUID() };
    const input = {
      requestId: randomUUID(),
      subject: "Account help",
      description: "Please help with account setup",
    };
    const first = await createSupportRequest(actor, input);
    expect(first.ok).toBe(true);
    expect(await createSupportRequest(actor, input)).toEqual(first);
    const conflict = await createSupportRequest(actor, { ...input, subject: "Different subject" });
    expect(conflict).toMatchObject({ ok: false, code: "CONFLICT" });
    if (!first.ok) throw new Error("Creation failed");
    const audit =
      await admin`select metadata, correlation_id from audit_log where target_id = ${first.data.id}`;
    expect(audit).toEqual([{ metadata: {}, correlation_id: actor.correlationId }]);
    expect((await listSupportRequests(actor)).items.some((r) => r.id === first.data.id)).toBe(true);
  });
  it("hides another user's requests even from a co-member Admin or another venture Owner", async () => {
    const input = {
      requestId: randomUUID(),
      subject: "Private",
      description: "Account-only support details",
    };
    const result = await createSupportRequest({ userId: fixture.user.carol }, input);
    expect(result.ok).toBe(true);
    for (const userId of [
      fixture.user.alice,
      fixture.user.bob,
      fixture.user.dave,
      fixture.user.mallory,
    ]) {
      const visible = await withUser({ userId }, (tx) =>
        tx.execute(sql`select * from support_requests where user_id = ${fixture.user.carol}`),
      );
      expect(visible).toHaveLength(0);
    }
  });
  it("RLS rejects spoofed ownership, status and runtime edits", async () => {
    const userId = fixture.user.alice;
    await expectPgError(
      withUser({ userId }, (tx) =>
        tx.execute(
          sql`insert into support_requests (user_id, request_id, subject, description) values (${fixture.user.bob}, ${randomUUID()}, 'Help', 'At least ten characters')`,
        ),
      ),
      "42501",
    );
    await expectPgError(
      withUser({ userId }, (tx) =>
        tx.execute(
          sql`insert into support_requests (user_id, request_id, subject, description, status) values (${userId}, ${randomUUID()}, 'Help', 'At least ten characters', 'resolved')`,
        ),
      ),
      "42501",
    );
    await expectPgError(
      withUser({ userId }, (tx) =>
        tx.execute(sql`update support_requests set status = 'resolved' where user_id = ${userId}`),
      ),
      "42501",
    );
    await expectPgError(
      withUser({ userId }, (tx) =>
        tx.execute(sql`delete from support_requests where user_id = ${userId}`),
      ),
      "42501",
    );
  });
  it("paginates same-time records without omissions or duplicates", async () => {
    const userId = fixture.user.mallory;
    for (let i = 0; i < 23; i++)
      await admin`insert into support_requests (user_id, request_id, subject, description, created_at) values (${userId}, ${randomUUID()}, ${`Help ${i}`}, 'At least ten characters', '2026-10-06T00:00:00Z')`;
    const first = await listSupportRequests({ userId });
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).not.toBeNull();
    const second = await listSupportRequests({ userId }, first.nextCursor!);
    expect(second.items).toHaveLength(3);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map((r) => r.id)).size).toBe(23);
  });
});
