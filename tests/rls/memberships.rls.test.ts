import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools, schema, withService, withTenant, withUser } from "@/platform/db";
import { adminSql, expectPgError, RLS_VIOLATION, seedTwoVentures } from "../helpers/db";
import { activateVenture, insertInvitation } from "../helpers/memberships";

/**
 * Database-level guarantees for memberships, invitations and access requests (migration
 * 0007, ADR-0013). These hold regardless of application code.
 */
const { ventures, ventureMemberships, ventureInvitations, ventureAccessRequests, auditLog } =
  schema;
let admin: Sql;
let f: Awaited<ReturnType<typeof seedTwoVentures>>;

beforeAll(async () => {
  admin = adminSql();
  f = await seedTwoVentures(admin);
  await activateVenture(admin, f.ventureA);
  await activateVenture(admin, f.ventureB);
});
afterAll(async () => {
  await closePools();
  await admin.end();
});

const ctxA = (userId: string) => ({ userId, ventureId: f.ventureA });
const ctxB = (userId: string) => ({ userId, ventureId: f.ventureB });

async function newUser(label: string, verified = true) {
  const id = randomUUID();
  const email = `${label}-${id.slice(0, 8)}@example.test`;
  await admin`insert into users (id, name, email, email_verified)
              values (${id}, ${label}, ${email}, ${verified})`;
  return { id, email };
}

/** An active venture owned by `owner` with optional extra members (isolated from `f`). */
async function ventureWith(owner: string, members: Array<[string, string]> = []) {
  const id = randomUUID();
  await admin`insert into ventures (id, name, created_by) values (${id}, ${`V ${id.slice(0, 6)}`}, ${owner})`;
  await admin`insert into venture_memberships (venture_id, user_id, role) values (${id}, ${owner}, 'owner')`;
  for (const [user, role] of members) {
    await admin`insert into venture_memberships (venture_id, user_id, role) values (${id}, ${user}, ${role})`;
  }
  await activateVenture(admin, id);
  return id;
}

const accept = (userId: string, tokenHash: string) =>
  withUser({ userId, correlationId: "corr-accept-0001" }, (tx) =>
    tx.execute<{ venture_id: string }>(
      sql`select app.accept_venture_invitation(${tokenHash}) as venture_id`,
    ),
  );

const preview = (userId: string, tokenHash: string) =>
  withUser({ userId }, async (tx) => {
    const rows = await tx.execute<{ state: string; venture_name: string | null }>(
      sql`select state, venture_name from app.preview_venture_invitation(${tokenHash})`,
    );
    return rows[0]!;
  });

const requestAccess = (userId: string, ventureId: string) =>
  withUser({ userId }, (tx) =>
    tx.execute(sql`select app.request_venture_access(${ventureId}::uuid)`),
  );

describe("privileges", () => {
  it("gives the runtime role no hard deletes and no direct access-request inserts", async () => {
    const [p] = await admin`
      select has_table_privilege('dxo_app', 'venture_memberships', 'DELETE') as m_del,
             has_table_privilege('dxo_app', 'venture_invitations', 'DELETE') as i_del,
             has_table_privilege('dxo_app', 'venture_access_requests', 'DELETE') as r_del,
             has_table_privilege('dxo_app', 'venture_access_requests', 'INSERT') as r_ins,
             has_column_privilege('dxo_app', 'venture_invitations', 'token_hash', 'UPDATE') as hash_upd,
             has_column_privilege('dxo_app', 'venture_invitations', 'role', 'UPDATE') as role_upd,
             has_table_privilege('dxo_auth', 'venture_invitations', 'SELECT') as auth_sel`;
    expect(p).toEqual({
      m_del: false,
      i_del: false,
      r_del: false,
      r_ins: false,
      hash_upd: false,
      role_upd: false,
      auth_sel: false,
    });
  });

  it("runs invitation acceptance and access requests as dxo_definer, callable by dxo_app only", async () => {
    const fns = await admin`
      select p.proname, r.rolname as owner, p.prosecdef,
             has_function_privilege('dxo_app', p.oid, 'EXECUTE') as app_exec,
             has_function_privilege('dxo_auth', p.oid, 'EXECUTE') as auth_exec
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      join pg_roles r on r.oid = p.proowner
      where n.nspname = 'app' and p.proname in
        ('accept_venture_invitation', 'preview_venture_invitation', 'request_venture_access')
      order by p.proname`;
    expect(fns).toHaveLength(3);
    for (const fn of fns) {
      expect(fn).toMatchObject({
        owner: "dxo_definer",
        prosecdef: true,
        app_exec: true,
        auth_exec: false,
      });
    }
  });

  it("refuses direct access-request inserts from the runtime role", async () => {
    await expectPgError(
      withTenant(ctxA(f.user.dave), (tx) =>
        tx.insert(ventureAccessRequests).values({
          ventureId: f.ventureA,
          requesterUserId: f.user.mallory,
          requesterName: "m",
          requesterEmail: "m@example.test",
        }),
      ),
      RLS_VIOLATION,
    );
  });
});

describe("invitation isolation", () => {
  let invA: string;
  let invB: string;
  beforeAll(async () => {
    invA = (
      await insertInvitation(admin, {
        ventureId: f.ventureA,
        email: `iso-a-${f.tag}@example.test`,
        role: "viewer",
        invitedBy: f.user.alice,
      })
    ).id;
    invB = (
      await insertInvitation(admin, {
        ventureId: f.ventureB,
        email: `iso-b-${f.tag}@example.test`,
        role: "viewer",
        invitedBy: f.user.bob,
      })
    ).id;
  });

  const visible = (ctx: { userId: string; ventureId?: string }) =>
    withUser(ctx, async (tx) =>
      (await tx.select({ id: ventureInvitations.id }).from(ventureInvitations)).map((r) => r.id),
    );

  it("shows Owner/Admin only the invitations of their active venture", async () => {
    expect(await visible(ctxA(f.user.alice))).toContain(invA);
    expect(await visible(ctxA(f.user.alice))).not.toContain(invB);
    expect(await visible(ctxA(f.user.dave))).toEqual(expect.arrayContaining([invA]));
    expect(await visible(ctxB(f.user.bob))).not.toContain(invA);
  });

  it("hides invitations from non-admins, other ventures, forged contexts and missing context", async () => {
    expect(await visible(ctxA(f.user.erin))).toEqual([]); // manager
    expect(await visible(ctxA(f.user.carol))).toEqual([]); // viewer
    expect(await visible(ctxB(f.user.dave))).toEqual([]); // manager in B
    expect(await visible(ctxB(f.user.alice))).toEqual([]); // forged: not a member of B
    expect(await visible(ctxA(f.user.mallory))).toEqual([]);
    expect(await visible({ userId: f.user.alice })).toEqual([]); // no venture context
  });
});

describe("invitation writes", () => {
  const values = (over: Partial<typeof ventureInvitations.$inferInsert> = {}) => ({
    ventureId: f.ventureA,
    email: `w-${randomUUID().slice(0, 8)}@example.test`,
    role: "operator" as const,
    tokenHash: "h".repeat(32) + randomUUID().replaceAll("-", "").slice(0, 11),
    invitedBy: f.user.dave,
    expiresAt: new Date(Date.now() + 86_400_000),
    ...over,
  });

  it("lets an Admin invite Operators as themselves in their own venture", async () => {
    const rows = await withTenant(ctxA(f.user.dave), (tx) =>
      tx.insert(ventureInvitations).values(values()).returning(),
    );
    expect(rows).toHaveLength(1);
  });

  it("refuses Admin→Admin, Owner, spoofed inviters, other ventures, non-admins and long expiry", async () => {
    const attempts: Array<[{ userId: string; ventureId: string }, ReturnType<typeof values>]> = [
      [ctxA(f.user.dave), values({ role: "admin" })],
      [ctxA(f.user.dave), values({ invitedBy: f.user.alice })],
      [ctxA(f.user.dave), values({ ventureId: f.ventureB })],
      [ctxB(f.user.dave), values({ ventureId: f.ventureB })], // manager in B
      [ctxA(f.user.erin), values({ invitedBy: f.user.erin })], // manager
      [ctxA(f.user.mallory), values({ invitedBy: f.user.mallory })],
      [ctxA(f.user.dave), values({ expiresAt: new Date(Date.now() + 40 * 86_400_000) })],
      [ctxA(f.user.dave), values({ expiresAt: new Date(Date.now() - 1000) })],
    ];
    for (const [ctx, row] of attempts) {
      await expectPgError(
        withTenant(ctx, (tx) => tx.insert(ventureInvitations).values(row)),
        RLS_VIOLATION,
      );
    }
    // Owner invitations: refused by policy for the Owner herself, and by a CHECK constraint
    // for every role (including the schema owner).
    await expectPgError(
      withTenant(ctxA(f.user.alice), (tx) =>
        tx.insert(ventureInvitations).values(values({ role: "owner", invitedBy: f.user.alice })),
      ),
      RLS_VIOLATION,
    );
    const owner = values({ role: "owner", invitedBy: f.user.alice });
    await expectPgError(
      admin`insert into venture_invitations (venture_id, email, role, token_hash, invited_by, expires_at)
            values (${owner.ventureId}, ${owner.email}, 'owner', ${owner.tokenHash}, ${owner.invitedBy}, ${owner.expiresAt})`,
      "23514",
    );
  });

  it("refuses invitations to ventures that are not active", async () => {
    const draft = randomUUID();
    await admin`insert into ventures (id, name, created_by) values (${draft}, 'Draft', ${f.user.alice})`;
    await admin`insert into venture_memberships (venture_id, user_id, role) values (${draft}, ${f.user.alice}, 'owner')`;
    await expectPgError(
      withTenant({ userId: f.user.alice, ventureId: draft }, (tx) =>
        tx.insert(ventureInvitations).values(values({ ventureId: draft, invitedBy: f.user.alice })),
      ),
      RLS_VIOLATION,
    );
  });

  it("lets Admins revoke manageable pending invitations only, as themselves", async () => {
    const own = await insertInvitation(admin, {
      ventureId: f.ventureA,
      email: `r1-${f.tag}@example.test`,
      role: "viewer",
      invitedBy: f.user.dave,
    });
    const adminInvite = await insertInvitation(admin, {
      ventureId: f.ventureA,
      email: `r2-${f.tag}@example.test`,
      role: "admin",
      invitedBy: f.user.alice,
    });
    const revoke = (userId: string, id: string, ventureId = f.ventureA, revokedBy = userId) =>
      withTenant({ userId, ventureId }, (tx) =>
        tx
          .update(ventureInvitations)
          .set({ status: "revoked", revokedAt: new Date(), revokedBy })
          .where(eq(ventureInvitations.id, id))
          .returning({ id: ventureInvitations.id }),
      );

    expect(await revoke(f.user.dave, adminInvite.id)).toEqual([]); // Admin cannot touch Admin invites
    expect(await revoke(f.user.bob, own.id, f.ventureB)).toEqual([]); // other venture
    expect(await revoke(f.user.erin, own.id)).toEqual([]); // manager
    await expectPgError(revoke(f.user.dave, own.id, f.ventureA, f.user.alice), RLS_VIOLATION);
    expect(await revoke(f.user.dave, own.id)).toHaveLength(1);
    expect(await revoke(f.user.alice, own.id)).toEqual([]); // no longer pending
    expect(await revoke(f.user.alice, adminInvite.id)).toHaveLength(1); // Owner can
  });

  it("never lets the runtime role accept, re-target or rewrite an invitation", async () => {
    const inv = await insertInvitation(admin, {
      ventureId: f.ventureA,
      email: `t-${f.tag}@example.test`,
      role: "viewer",
      invitedBy: f.user.alice,
    });
    await expectPgError(
      withTenant(ctxA(f.user.alice), (tx) =>
        tx
          .update(ventureInvitations)
          .set({ status: "accepted" })
          .where(eq(ventureInvitations.id, inv.id)),
      ),
      RLS_VIOLATION,
    );
    await expectPgError(
      withTenant(ctxA(f.user.alice), (tx) =>
        tx
          .update(ventureInvitations)
          .set({ role: "admin" })
          .where(eq(ventureInvitations.id, inv.id)),
      ),
      RLS_VIOLATION, // no column privilege
    );
    // Terminal states are final for every role, including the schema owner.
    await admin`update venture_invitations set status = 'revoked', revoked_at = now(), revoked_by = ${f.user.alice} where id = ${inv.id}`;
    await expectPgError(
      admin`update venture_invitations set status = 'pending', revoked_at = null, revoked_by = null where id = ${inv.id}`,
      "DXM08",
    );
  });
});

describe("app.accept_venture_invitation", () => {
  it("creates the membership, marks the invitation accepted and audits both atomically", async () => {
    const invitee = await newUser("invitee");
    const inv = await insertInvitation(admin, {
      ventureId: f.ventureA,
      email: invitee.email.toUpperCase(),
      role: "operator",
      invitedBy: f.user.dave,
    });

    const [row] = await accept(invitee.id, inv.tokenHash);
    expect(row!.venture_id).toBe(f.ventureA);

    const [m] = await admin`select role, status, invited_by from venture_memberships
                            where venture_id = ${f.ventureA} and user_id = ${invitee.id}`;
    expect(m).toEqual({ role: "operator", status: "active", invited_by: f.user.dave });
    const [i] =
      await admin`select status, accepted_by from venture_invitations where id = ${inv.id}`;
    expect(i).toEqual({ status: "accepted", accepted_by: invitee.id });
    const audit = await admin`select action, actor_user_id, correlation_id from audit_log
                              where venture_id = ${f.ventureA} and subject_user_id = ${invitee.id} order by action`;
    expect(audit).toEqual([
      {
        action: "venture.invitation.accepted",
        actor_user_id: invitee.id,
        correlation_id: "corr-accept-0001",
      },
      {
        action: "venture.membership.created",
        actor_user_id: invitee.id,
        correlation_id: "corr-accept-0001",
      },
    ]);

    // Single use: a replay fails and changes nothing.
    await expectPgError(accept(invitee.id, inv.tokenHash), "DXM01");
  });

  it("stores only the token digest; neither the invitation nor its audit trail holds the raw token", async () => {
    const invitee = await newUser("digest");
    const inv = await insertInvitation(admin, {
      ventureId: f.ventureA,
      email: invitee.email,
      role: "viewer",
      invitedBy: f.user.alice,
    });
    await accept(invitee.id, inv.tokenHash);
    const dump = JSON.stringify([
      await admin`select * from venture_invitations where id = ${inv.id}`,
      await admin`select * from audit_log where venture_id = ${f.ventureA}`,
      await admin`select * from venture_memberships where user_id = ${invitee.id}`,
    ]);
    expect(dump).not.toContain(inv.token);
    expect(dump).toContain(inv.tokenHash);
  });

  it("rejects unknown, revoked, expired and wrong-account invitations without creating a membership", async () => {
    const invitee = await newUser("reject");
    const other = await newUser("other");
    const unverified = await newUser("unverified", false);
    const count = async (userId: string) =>
      (
        await admin`select count(*)::int as n from venture_memberships where user_id = ${userId}`
      )[0]!.n;

    await expectPgError(accept(invitee.id, "x".repeat(43)), "DXM01");

    const revoked = await insertInvitation(admin, {
      ventureId: f.ventureA,
      email: invitee.email,
      role: "viewer",
      invitedBy: f.user.alice,
    });
    await admin`update venture_invitations set status = 'revoked', revoked_at = now(), revoked_by = ${f.user.alice} where id = ${revoked.id}`;
    await expectPgError(accept(invitee.id, revoked.tokenHash), "DXM01");

    const expired = await insertInvitation(admin, {
      ventureId: f.ventureA,
      email: invitee.email,
      role: "viewer",
      invitedBy: f.user.alice,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expectPgError(accept(invitee.id, expired.tokenHash), "DXM02");
    await admin`update venture_invitations set status = 'expired' where id = ${expired.id}`;

    const live = await insertInvitation(admin, {
      ventureId: f.ventureA,
      email: invitee.email,
      role: "viewer",
      invitedBy: f.user.alice,
    });
    await expectPgError(accept(other.id, live.tokenHash), "DXM03");
    await admin`update users set email = ${`v-${invitee.email}`} where id = ${unverified.id}`;
    await expectPgError(accept(unverified.id, live.tokenHash), "DXM03");

    expect(await count(invitee.id)).toBe(0);
    expect(await count(other.id)).toBe(0);
    const [i] = await admin`select status from venture_invitations where id = ${live.id}`;
    expect(i!.status).toBe("pending");
  });

  it("revalidates the venture and the inviter's continuing authority at acceptance", async () => {
    const owner = await newUser("rv-owner");
    const inviter = await newUser("rv-admin");
    const invitee = await newUser("rv-invitee");
    const v = await ventureWith(owner.id, [[inviter.id, "admin"]]);
    const inv = await insertInvitation(admin, {
      ventureId: v,
      email: invitee.email,
      role: "manager",
      invitedBy: inviter.id,
    });

    await admin`update venture_memberships set role = 'viewer' where venture_id = ${v} and user_id = ${inviter.id}`;
    await expectPgError(accept(invitee.id, inv.tokenHash), "DXM01");
    await admin`update venture_memberships set role = 'admin' where venture_id = ${v} and user_id = ${inviter.id}`;

    await admin`update ventures set status = 'suspended' where id = ${v}`;
    await expectPgError(accept(invitee.id, inv.tokenHash), "DXM01");
    await admin`update ventures set status = 'active' where id = ${v}`;

    await accept(invitee.id, inv.tokenHash);
    const [m] =
      await admin`select role from venture_memberships where venture_id = ${v} and user_id = ${invitee.id}`;
    expect(m!.role).toBe("manager");
  });

  it("refuses existing active or suspended members and restores removed members", async () => {
    const owner = await newUser("st-owner");
    const active = await newUser("st-active");
    const suspended = await newUser("st-suspended");
    const removed = await newUser("st-removed");
    const v = await ventureWith(owner.id, [
      [active.id, "viewer"],
      [suspended.id, "viewer"],
      [removed.id, "admin"],
    ]);
    await admin`update venture_memberships set status = 'suspended' where venture_id = ${v} and user_id = ${suspended.id}`;
    await admin`update venture_memberships set status = 'removed' where venture_id = ${v} and user_id = ${removed.id}`;
    const invite = async (email: string) =>
      insertInvitation(admin, { ventureId: v, email, role: "operator", invitedBy: owner.id });

    await expectPgError(accept(active.id, (await invite(active.email)).tokenHash), "DXM04");
    await expectPgError(accept(suspended.id, (await invite(suspended.email)).tokenHash), "DXM05");

    await accept(removed.id, (await invite(removed.email)).tokenHash);
    const [m] =
      await admin`select role, status, removed_at from venture_memberships where venture_id = ${v} and user_id = ${removed.id}`;
    expect(m).toEqual({ role: "operator", status: "active", removed_at: null });
    const [a] =
      await admin`select action from audit_log where venture_id = ${v} and target_type = 'membership' and subject_user_id = ${removed.id}`;
    expect(a!.action).toBe("venture.membership.reactivated");
  });

  it("previews details only for the invited account", async () => {
    const invitee = await newUser("pv");
    const inv = await insertInvitation(admin, {
      ventureId: f.ventureA,
      email: invitee.email,
      role: "viewer",
      invitedBy: f.user.alice,
    });
    expect(await preview(invitee.id, inv.tokenHash)).toEqual({
      state: "valid",
      venture_name: `Venture A ${f.tag}`,
    });
    expect(await preview(f.user.mallory, inv.tokenHash)).toEqual({
      state: "wrong_account",
      venture_name: null,
    });
    expect(await preview(invitee.id, "y".repeat(43))).toEqual({
      state: "invalid",
      venture_name: null,
    });
    await expectPgError(
      withUser({ userId: f.user.alice }, (tx) =>
        tx.execute(sql`select * from app.preview_venture_invitation('x')`),
      ).then(() =>
        withService({ serviceId: "worker:test" }, (tx) =>
          tx.execute(sql`select * from app.preview_venture_invitation('x')`),
        ),
      ),
      "42501",
    );
  });
});

describe("app.request_venture_access", () => {
  const pending = async (ventureId: string, userId: string) =>
    (
      await admin`select count(*)::int as n from venture_access_requests
                 where venture_id = ${ventureId} and requester_user_id = ${userId} and status = 'pending'`
    )[0]!.n;

  it("creates one pending request with an audit record and snapshots the requester", async () => {
    const requester = await newUser("req");
    await requestAccess(requester.id, f.ventureA);
    await requestAccess(requester.id, f.ventureA); // duplicate is a no-op
    expect(await pending(f.ventureA, requester.id)).toBe(1);
    const [r] =
      await admin`select requester_name, requester_email from venture_access_requests where requester_user_id = ${requester.id}`;
    expect(r).toEqual({ requester_name: "req", requester_email: requester.email });
    const audit =
      await admin`select action from audit_log where venture_id = ${f.ventureA} and actor_user_id = ${requester.id}`;
    expect(audit).toEqual([{ action: "venture.access_request.created" }]);
  });

  it("returns identically and records nothing for unknown, draft, joined and suspended cases", async () => {
    const requester = await newUser("quiet");
    const draft = randomUUID();
    await admin`insert into ventures (id, name, created_by) values (${draft}, 'Draft', ${f.user.alice})`;
    await requestAccess(requester.id, randomUUID());
    await requestAccess(requester.id, draft);
    await requestAccess(f.user.carol, f.ventureA); // already a member
    const suspended = await newUser("susp");
    await admin`insert into venture_memberships (venture_id, user_id, role, status) values (${f.ventureA}, ${suspended.id}, 'viewer', 'suspended')`;
    await requestAccess(suspended.id, f.ventureA);
    const rows =
      await admin`select 1 from venture_access_requests where requester_user_id in ${admin([requester.id, f.user.carol, suspended.id])}`;
    expect(rows).toEqual([]);
  });

  it("requires a verified user context", async () => {
    const unverified = await newUser("unv", false);
    await expectPgError(requestAccess(unverified.id, f.ventureA), "42501");
    await expectPgError(
      withService({ serviceId: "worker:test", ventureId: f.ventureA }, (tx) =>
        tx.execute(sql`select app.request_venture_access(${f.ventureA}::uuid)`),
      ),
      "42501",
    );
  });

  it("silently caps pending requests per requester", async () => {
    const requester = await newUser("cap");
    const owner = await newUser("cap-owner");
    const targets: string[] = [];
    for (let i = 0; i < 11; i += 1) targets.push(await ventureWith(owner.id));
    for (const v of targets) await requestAccess(requester.id, v);
    const [{ n }] =
      (await admin`select count(*)::int as n from venture_access_requests where requester_user_id = ${requester.id}`) as unknown as [
        { n: number },
      ];
    expect(n).toBe(10);
  });
});

describe("access request review", () => {
  let reqA: string;
  let reqB: string;
  let requester: { id: string; email: string };
  beforeAll(async () => {
    requester = await newUser("review");
    await requestAccess(requester.id, f.ventureA);
    await requestAccess(requester.id, f.ventureB);
    const rows = await admin<
      { id: string; venture_id: string }[]
    >`select id, venture_id from venture_access_requests where requester_user_id = ${requester.id}`;
    reqA = rows.find((r) => r.venture_id === f.ventureA)!.id;
    reqB = rows.find((r) => r.venture_id === f.ventureB)!.id;
  });

  const visible = (ctx: { userId: string; ventureId?: string }) =>
    withUser(ctx, async (tx) =>
      (await tx.select({ id: ventureAccessRequests.id }).from(ventureAccessRequests)).map(
        (r) => r.id,
      ),
    );

  it("shows requests only to Owner/Admin of the active venture (never to the requester)", async () => {
    expect(await visible(ctxA(f.user.dave))).toContain(reqA);
    expect(await visible(ctxA(f.user.dave))).not.toContain(reqB);
    expect(await visible(ctxB(f.user.bob))).toContain(reqB);
    expect(await visible(ctxB(f.user.bob))).not.toContain(reqA);
    expect(await visible(ctxB(f.user.dave))).toEqual([]); // manager in B
    expect(await visible(ctxA(f.user.erin))).toEqual([]);
    expect(await visible(ctxA(requester.id))).toEqual([]);
    expect(await visible({ userId: requester.id })).toEqual([]);
  });

  const review = (
    ctx: { userId: string; ventureId: string },
    id: string,
    set: Partial<typeof ventureAccessRequests.$inferInsert>,
  ) =>
    withTenant(ctx, (tx) =>
      tx
        .update(ventureAccessRequests)
        .set({ reviewedAt: new Date(), ...set })
        .where(eq(ventureAccessRequests.id, id))
        .returning({ id: ventureAccessRequests.id }),
    );

  it("refuses cross-venture review, Admin→Admin grants and spoofed reviewers", async () => {
    expect(
      await review(ctxA(f.user.dave), reqB, { status: "rejected", reviewedBy: f.user.dave }),
    ).toEqual([]);
    expect(
      await review(ctxB(f.user.dave), reqB, { status: "rejected", reviewedBy: f.user.dave }),
    ).toEqual([]);
    await expectPgError(
      review(ctxA(f.user.dave), reqA, {
        status: "approved",
        grantedRole: "admin",
        reviewedBy: f.user.dave,
      }),
      RLS_VIOLATION,
    );
    await expectPgError(
      review(ctxA(f.user.dave), reqA, { status: "rejected", reviewedBy: f.user.alice }),
      RLS_VIOLATION,
    );
  });

  it("lets an Admin approve with a manageable role once; reviewed requests are final", async () => {
    expect(
      await review(ctxA(f.user.dave), reqA, {
        status: "approved",
        grantedRole: "operator",
        reviewedBy: f.user.dave,
      }),
    ).toHaveLength(1);
    expect(
      await review(ctxA(f.user.alice), reqA, {
        status: "rejected",
        grantedRole: null,
        reviewedBy: f.user.alice,
      }),
    ).toEqual([]);
    await expectPgError(
      admin`update venture_access_requests set status = 'pending', reviewed_by = null, reviewed_at = null, granted_role = null where id = ${reqA}`,
      "DXM08",
    );
  });
});

describe("membership isolation and role rules", () => {
  const listed = (ctx: { userId: string; ventureId: string }) =>
    withTenant(
      ctx,
      async (tx) =>
        await tx
          .select({ v: ventureMemberships.ventureId, u: ventureMemberships.userId })
          .from(ventureMemberships),
    );

  it("lists only the active venture's memberships (plus the caller's own rows)", async () => {
    const a = await listed(ctxA(f.user.dave));
    expect(a.filter((r) => r.v === f.ventureB).map((r) => r.u)).toEqual([f.user.dave]); // own row only
    const forged = await listed(ctxB(f.user.alice));
    expect(forged.filter((r) => r.v === f.ventureB)).toEqual([]);
  });

  const setRole = (
    ctx: { userId: string; ventureId: string },
    userId: string,
    ventureId: string,
    role: "admin" | "manager" | "operator" | "viewer",
  ) =>
    withTenant(ctx, (tx) =>
      tx
        .update(ventureMemberships)
        .set({ role })
        .where(
          and(eq(ventureMemberships.ventureId, ventureId), eq(ventureMemberships.userId, userId)),
        )
        .returning({ id: ventureMemberships.id }),
    );

  it("isolates role updates by venture, role and target", async () => {
    expect(await setRole(ctxA(f.user.dave), f.user.bob, f.ventureB, "viewer")).toEqual([]); // other venture
    expect(await setRole(ctxB(f.user.dave), f.user.bob, f.ventureB, "viewer")).toEqual([]); // manager in B
    expect(await setRole(ctxA(f.user.dave), f.user.dave, f.ventureA, "manager")).toEqual([]); // own Admin row
    expect(await setRole(ctxA(f.user.dave), f.user.alice, f.ventureA, "viewer")).toEqual([]); // Owner row
    expect(await setRole(ctxA(f.user.alice), f.user.alice, f.ventureA, "viewer")).toEqual([]); // Owner self
    expect(await setRole(ctxA(f.user.erin), f.user.carol, f.ventureA, "operator")).toEqual([]); // manager
    await expectPgError(
      setRole(ctxA(f.user.dave), f.user.carol, f.ventureA, "admin"),
      RLS_VIOLATION,
    );
    expect(await setRole(ctxA(f.user.dave), f.user.carol, f.ventureA, "operator")).toHaveLength(1);
    expect(await setRole(ctxA(f.user.dave), f.user.carol, f.ventureA, "viewer")).toHaveLength(1);
  });

  it("keeps exactly one Owner for every role, including the schema owner", async () => {
    const owner = await newUser("inv-owner");
    const v = await ventureWith(owner.id);
    await expectPgError(
      admin`update venture_memberships set role = 'admin' where venture_id = ${v} and user_id = ${owner.id}`,
      "DXM07",
    );
    await expectPgError(
      admin`update venture_memberships set status = 'removed' where venture_id = ${v} and user_id = ${owner.id}`,
      "DXM07",
    );
    await expectPgError(
      admin`update venture_memberships set status = 'suspended' where venture_id = ${v} and user_id = ${owner.id}`,
      "DXM07",
    );
    const second = await newUser("second-owner");
    await expectPgError(
      admin`insert into venture_memberships (venture_id, user_id, role) values (${v}, ${second.id}, 'owner')`,
      "42501",
    );
    const member = await newUser("promote");
    await admin`insert into venture_memberships (venture_id, user_id, role) values (${v}, ${member.id}, 'admin')`;
    await expectPgError(
      admin`update venture_memberships set role = 'owner' where venture_id = ${v} and user_id = ${member.id}`,
      "DXM07",
    );
    const owners =
      await admin`select user_id from venture_memberships where venture_id = ${v} and role = 'owner'`;
    expect(owners).toEqual([{ user_id: owner.id }]);
  });

  it("removal takes effect on the next statement: venture data disappears for the removed member", async () => {
    const member = await newUser("leaver");
    await admin`insert into venture_memberships (venture_id, user_id, role) values (${f.ventureA}, ${member.id}, 'viewer')`;
    const seen = () =>
      withTenant(ctxA(member.id), async (tx) => ({
        ventures: (await tx.select({ id: ventures.id }).from(ventures)).length,
        others: (await tx.select({ u: ventureMemberships.userId }).from(ventureMemberships)).filter(
          (r) => r.u !== member.id,
        ).length,
        audit: (await tx.select({ id: auditLog.id }).from(auditLog)).length,
      }));
    expect((await seen()).ventures).toBe(1);
    expect((await seen()).others).toBeGreaterThan(0);

    const removed = await withTenant(ctxA(f.user.dave), (tx) =>
      tx
        .update(ventureMemberships)
        .set({ status: "removed" })
        .where(
          and(
            eq(ventureMemberships.ventureId, f.ventureA),
            eq(ventureMemberships.userId, member.id),
          ),
        )
        .returning({ removedAt: ventureMemberships.removedAt }),
    );
    expect(removed[0]!.removedAt).toBeInstanceOf(Date);
    expect(await seen()).toEqual({ ventures: 0, others: 0, audit: 0 });
    await expectPgError(
      withTenant(ctxA(member.id), (tx) =>
        tx.delete(ventureMemberships).where(eq(ventureMemberships.userId, member.id)),
      ),
      RLS_VIOLATION,
    );
  });

  it("lets a venture-scoped service identity see current membership state (background jobs)", async () => {
    const rows = await withService({ serviceId: "worker:test", ventureId: f.ventureA }, (tx) =>
      tx.select({ v: ventureMemberships.ventureId }).from(ventureMemberships),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.v === f.ventureA)).toBe(true);
    const none = await withService({ serviceId: "worker:test" }, (tx) =>
      tx.select({ v: ventureMemberships.ventureId }).from(ventureMemberships),
    );
    expect(none).toEqual([]);
  });
});
