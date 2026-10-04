import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools } from "@/platform/db";
import {
  approveAccessRequest,
  changeMemberStatus,
  getTeam,
  rejectAccessRequest,
  requestAccess,
} from "@/modules/memberships";
import {
  resolveSelectedVenture,
  VentureNotFoundError,
  VenturePermissionError,
} from "@/modules/ventures";
import { adminSql } from "../../helpers/db";
import { activeVenture, actor, membershipOf, ventureAudit } from "../../helpers/memberships";

let admin: Sql;
beforeAll(() => {
  admin = adminSql();
});
afterAll(async () => {
  await closePools();
  await admin.end();
});

const venture = () =>
  activeVenture(admin, { owner: "owner", admin: "admin", manager: "manager", viewer: "viewer" });

async function requestIdFor(ventureId: string, userId: string) {
  const [row] = await admin<{ id: string; status: string }[]>`
    select id, status from venture_access_requests
    where venture_id = ${ventureId} and requester_user_id = ${userId}
    order by created_at desc limit 1`;
  return row;
}

describe("requesting access", () => {
  it("creates a pending request that reviewers see, with an audit record", async () => {
    const { ventureId, people } = await venture();
    const requester = await actor(admin, "requester");
    await requestAccess(requester, ventureId);

    const team = await getTeam(people.admin, ventureId);
    expect(team.accessRequests).toEqual([
      expect.objectContaining({ requesterName: "requester", requesterEmail: requester.email }),
    ]);
    const [audit] = (await ventureAudit(admin, ventureId)).filter(
      (a) => a.action === "venture.access_request.created",
    );
    expect(audit).toMatchObject({
      actor_user_id: requester.userId,
      correlation_id: requester.correlationId,
    });
  });

  it("treats duplicates as the same pending request", async () => {
    const { ventureId, people } = await venture();
    const requester = await actor(admin, "repeat");
    await requestAccess(requester, ventureId);
    await requestAccess(requester, ventureId);
    expect((await getTeam(people.owner, ventureId)).accessRequests).toHaveLength(1);
  });

  it("behaves identically for unknown, malformed and real ventures (no discovery)", async () => {
    const requester = await actor(admin, "prober");
    await expect(requestAccess(requester, randomUUID())).resolves.toBeUndefined();
    await expect(requestAccess(requester, "not-a-uuid")).resolves.toBeUndefined();
    const { ventureId } = await venture();
    await expect(requestAccess(requester, ventureId)).resolves.toBeUndefined();
    // The requester still cannot see anything about the venture.
    await expect(resolveSelectedVenture(requester, ventureId)).rejects.toBeInstanceOf(
      VentureNotFoundError,
    );
  });
});

describe("reviewing requests", () => {
  it("approval creates the membership, approves the request and audits, all at once", async () => {
    const { ventureId, people } = await venture();
    const requester = await actor(admin, "approved");
    await requestAccess(requester, ventureId);
    const request = await requestIdFor(ventureId, requester.userId);

    expect(
      await approveAccessRequest(people.admin, ventureId, {
        requestId: request!.id,
        role: "operator",
      }),
    ).toEqual({ ok: true, data: undefined });
    await expect(resolveSelectedVenture(requester, ventureId)).resolves.toMatchObject({
      role: "operator",
    });
    const [row] = await admin`select status, granted_role, reviewed_by from venture_access_requests
                              where id = ${request!.id}`;
    expect(row).toEqual({
      status: "approved",
      granted_role: "operator",
      reviewed_by: people.admin.userId,
    });

    const actions = (await ventureAudit(admin, ventureId))
      .filter((a) => a.actor_user_id === people.admin.userId)
      .map((a) => a.action)
      .sort(); // written in one transaction: same timestamp
    expect(actions).toEqual(["venture.access_request.approved", "venture.membership.created"]);

    expect(
      await approveAccessRequest(people.owner, ventureId, {
        requestId: request!.id,
        role: "viewer",
      }),
    ).toMatchObject({ ok: false, code: "INVALID_STATE" });
  });

  it("rejection records the reviewer and grants nothing", async () => {
    const { ventureId, people } = await venture();
    const requester = await actor(admin, "rejected");
    await requestAccess(requester, ventureId);
    const request = await requestIdFor(ventureId, requester.userId);

    expect(await rejectAccessRequest(people.owner, ventureId, { requestId: request!.id })).toEqual({
      ok: true,
      data: undefined,
    });
    const [row] = await admin`select status, granted_role, reviewed_by from venture_access_requests
                              where id = ${request!.id}`;
    expect(row).toEqual({
      status: "rejected",
      granted_role: null,
      reviewed_by: people.owner.userId,
    });
    expect(await membershipOf(admin, ventureId, requester.userId)).toBeUndefined();
    expect((await ventureAudit(admin, ventureId)).map((a) => a.action)).toContain(
      "venture.access_request.rejected",
    );
    expect(
      await rejectAccessRequest(people.owner, ventureId, { requestId: request!.id }),
    ).toMatchObject({ ok: false, code: "INVALID_STATE" });
  });

  it("refuses review by non-admins and Admin grants of Admin", async () => {
    const { ventureId, people } = await venture();
    const requester = await actor(admin, "unauth");
    await requestAccess(requester, ventureId);
    const request = await requestIdFor(ventureId, requester.userId);
    for (const who of [people.manager, people.viewer, requester]) {
      await expect(
        approveAccessRequest(who, ventureId, { requestId: request!.id, role: "viewer" }),
      ).rejects.toBeInstanceOf(who === requester ? VentureNotFoundError : VenturePermissionError);
      await expect(
        rejectAccessRequest(who, ventureId, { requestId: request!.id }),
      ).rejects.toBeInstanceOf(who === requester ? VentureNotFoundError : VenturePermissionError);
    }
    expect(
      await approveAccessRequest(people.admin, ventureId, {
        requestId: request!.id,
        role: "admin",
      }),
    ).toMatchObject({ ok: false, code: "NOT_PERMITTED" });
    expect(
      await approveAccessRequest(people.owner, ventureId, {
        requestId: request!.id,
        role: "owner",
      }),
    ).toMatchObject({ ok: false, code: "VALIDATION" });
    expect((await requestIdFor(ventureId, requester.userId))!.status).toBe("pending");
    expect(await membershipOf(admin, ventureId, requester.userId)).toBeUndefined();
  });

  it("blocks cross-venture approval attacks", async () => {
    const a = await venture();
    const b = await venture();
    const requester = await actor(admin, "target-b");
    await requestAccess(requester, b.ventureId);
    const request = await requestIdFor(b.ventureId, requester.userId);

    // Venture A's Owner names B's request while acting in A...
    expect(
      await approveAccessRequest(a.people.owner, a.ventureId, {
        requestId: request!.id,
        role: "viewer",
      }),
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
    // ...or targets B directly without membership.
    await expect(
      approveAccessRequest(a.people.owner, b.ventureId, { requestId: request!.id, role: "viewer" }),
    ).rejects.toBeInstanceOf(VentureNotFoundError);
    expect((await requestIdFor(b.ventureId, requester.userId))!.status).toBe("pending");
    expect(await membershipOf(admin, a.ventureId, requester.userId)).toBeUndefined();
    expect(await membershipOf(admin, b.ventureId, requester.userId)).toBeUndefined();
  });

  it("restores a removed member through a new request, and refuses current members", async () => {
    const { ventureId, people } = await venture();
    const row = await membershipOf(admin, ventureId, people.viewer.userId);
    expect(
      (
        await changeMemberStatus(people.owner, ventureId, {
          membershipId: row!.id,
          change: "remove",
        })
      ).ok,
    ).toBe(true);

    await requestAccess(people.viewer, ventureId);
    const request = await requestIdFor(ventureId, people.viewer.userId);
    expect(
      await approveAccessRequest(people.admin, ventureId, {
        requestId: request!.id,
        role: "manager",
      }),
    ).toEqual({ ok: true, data: undefined });
    expect(await membershipOf(admin, ventureId, people.viewer.userId)).toMatchObject({
      id: row!.id,
      role: "manager",
      status: "active",
    });
    expect((await ventureAudit(admin, ventureId)).map((a) => a.action)).toContain(
      "venture.membership.reactivated",
    );

    // Active members never create requests in the first place.
    await requestAccess(people.manager, ventureId);
    expect(await requestIdFor(ventureId, people.manager.userId)).toBeUndefined();
  });

  it("re-checks the reviewer's role inside the approval transaction", async () => {
    const { ventureId, people } = await venture();
    const requester = await actor(admin, "late");
    await requestAccess(requester, ventureId);
    const request = await requestIdFor(ventureId, requester.userId);
    // The Admin is demoted after loading the page but before approving.
    await admin`update venture_memberships set role = 'viewer'
                where venture_id = ${ventureId} and user_id = ${people.admin.userId}`;
    await expect(
      approveAccessRequest(people.admin, ventureId, { requestId: request!.id, role: "viewer" }),
    ).rejects.toBeInstanceOf(VenturePermissionError);
    expect(await membershipOf(admin, ventureId, requester.userId)).toBeUndefined();
  });
});
