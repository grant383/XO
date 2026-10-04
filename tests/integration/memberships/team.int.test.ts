import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools } from "@/platform/db";
import {
  assertMembershipForJob,
  changeMemberRole,
  changeMemberStatus,
  getTeam,
  MembershipRevokedError,
} from "@/modules/memberships";
import {
  listSwitchableVentures,
  resolveSelectedVenture,
  VentureNotFoundError,
  VenturePermissionError,
} from "@/modules/ventures";
import { adminSql } from "../../helpers/db";
import { activeVenture, membershipOf, ventureAudit } from "../../helpers/memberships";

let admin: Sql;
beforeAll(() => {
  admin = adminSql();
});
afterAll(async () => {
  await closePools();
  await admin.end();
});

const team = (a: Sql) =>
  activeVenture(a, {
    owner: "owner",
    admin: "admin",
    manager: "manager",
    operator: "operator",
    viewer: "viewer",
  });

describe("viewing members", () => {
  it("lets the Owner and Admins see every non-removed member with their own permissions", async () => {
    const { ventureId, people } = await team(admin);
    const asOwner = await getTeam(people.owner, ventureId);
    expect(asOwner.members.map((m) => m.role)).toEqual([
      "owner",
      "admin",
      "manager",
      "operator",
      "viewer",
    ]);
    expect(asOwner.viewer).toMatchObject({
      role: "owner",
      assignableRoles: ["admin", "manager", "operator", "viewer"],
    });
    expect(asOwner.members.find((m) => m.role === "owner")).toMatchObject({
      isSelf: true,
      manageable: false,
    });

    const asAdmin = await getTeam(people.admin, ventureId);
    expect(asAdmin.viewer.assignableRoles).toEqual(["manager", "operator", "viewer"]);
    const manageable = Object.fromEntries(asAdmin.members.map((m) => [m.role, m.manageable]));
    expect(manageable).toEqual({
      owner: false,
      admin: false, // self
      manager: true,
      operator: true,
      viewer: true,
    });
  });

  it("restricts Managers, Operators and Viewers", async () => {
    const { ventureId, people } = await team(admin);
    for (const who of [people.manager, people.operator, people.viewer]) {
      await expect(getTeam(who, ventureId)).rejects.toBeInstanceOf(VenturePermissionError);
    }
  });

  it("never lists another venture's members, for forged or unknown ids alike", async () => {
    const a = await team(admin);
    const b = await team(admin);
    await expect(getTeam(a.people.owner, b.ventureId)).rejects.toBeInstanceOf(VentureNotFoundError);
    await expect(getTeam(a.people.owner, "not-a-uuid")).rejects.toBeInstanceOf(
      VentureNotFoundError,
    );
    await expect(
      getTeam(a.people.owner, "00000000-0000-4000-8000-000000000000"),
    ).rejects.toBeInstanceOf(VentureNotFoundError);
    const view = await getTeam(a.people.owner, a.ventureId);
    const bUsers = Object.values(b.people).map((p) => p.userId);
    expect(view.members.some((m) => bUsers.includes(m.userId))).toBe(false);
  });
});

describe("role changes", () => {
  it("lets an authorised Admin change a Viewer's role, audited, effective immediately", async () => {
    const { ventureId, people } = await team(admin);
    const target = await membershipOf(admin, ventureId, people.viewer.userId);
    await expect(getTeam(people.viewer, ventureId)).rejects.toBeInstanceOf(VenturePermissionError);

    const res = await changeMemberRole(people.admin, ventureId, {
      membershipId: target!.id,
      role: "manager",
      expectedVersion: target!.version,
    });
    expect(res).toEqual({ ok: true, data: { version: target!.version + 1 } });
    expect((await membershipOf(admin, ventureId, people.viewer.userId))!.role).toBe("manager");

    const audit = (await ventureAudit(admin, ventureId)).filter(
      (a) => a.action === "venture.membership.role_changed",
    );
    expect(audit).toEqual([
      expect.objectContaining({
        actor_user_id: people.admin.userId,
        subject_user_id: people.viewer.userId,
        target_id: target!.id,
        metadata: { from: "viewer", to: "manager" },
        correlation_id: people.admin.correlationId,
      }),
    ]);
  });

  it("applies a promotion or demotion on the member's next request (no cached permissions)", async () => {
    const { ventureId, people } = await team(admin);
    const m = await membershipOf(admin, ventureId, people.manager.userId);
    await expect(getTeam(people.manager, ventureId)).rejects.toBeInstanceOf(VenturePermissionError);
    expect(
      (await changeMemberRole(people.owner, ventureId, { membershipId: m!.id, role: "admin" })).ok,
    ).toBe(true);
    expect((await getTeam(people.manager, ventureId)).viewer.role).toBe("admin");
    expect(
      (await changeMemberRole(people.owner, ventureId, { membershipId: m!.id, role: "viewer" })).ok,
    ).toBe(true);
    await expect(getTeam(people.manager, ventureId)).rejects.toBeInstanceOf(VenturePermissionError);
  });

  it("refuses self-escalation, Admin→Admin promotion and changes by non-admins", async () => {
    const { ventureId, people } = await team(admin);
    const adminRow = await membershipOf(admin, ventureId, people.admin.userId);
    const viewerRow = await membershipOf(admin, ventureId, people.viewer.userId);
    const managerRow = await membershipOf(admin, ventureId, people.manager.userId);

    expect(
      await changeMemberRole(people.admin, ventureId, {
        membershipId: adminRow!.id,
        role: "manager",
      }),
    ).toMatchObject({ ok: false, code: "NOT_PERMITTED" });
    expect(
      await changeMemberRole(people.admin, ventureId, {
        membershipId: viewerRow!.id,
        role: "admin",
      }),
    ).toMatchObject({ ok: false, code: "NOT_PERMITTED" });
    await expect(
      changeMemberRole(people.manager, ventureId, { membershipId: managerRow!.id, role: "admin" }),
    ).rejects.toBeInstanceOf(VenturePermissionError);
    await expect(
      changeMemberRole(people.viewer, ventureId, { membershipId: viewerRow!.id, role: "admin" }),
    ).rejects.toBeInstanceOf(VenturePermissionError);
    expect(
      await changeMemberRole(people.owner, ventureId, {
        membershipId: viewerRow!.id,
        role: "owner",
      }),
    ).toMatchObject({ ok: false, code: "VALIDATION" });
    expect((await membershipOf(admin, ventureId, people.viewer.userId))!.role).toBe("viewer");
    expect((await membershipOf(admin, ventureId, people.admin.userId))!.role).toBe("admin");
  });

  it("never demotes, suspends or removes the sole Owner", async () => {
    const { ventureId, people } = await team(admin);
    const ownerRow = await membershipOf(admin, ventureId, people.owner.userId);
    for (const actor of [people.owner, people.admin]) {
      expect(
        await changeMemberRole(actor, ventureId, { membershipId: ownerRow!.id, role: "admin" }),
      ).toMatchObject({ ok: false, code: "NOT_PERMITTED" });
      for (const change of ["suspend", "remove"] as const) {
        expect(
          await changeMemberStatus(actor, ventureId, { membershipId: ownerRow!.id, change }),
        ).toMatchObject({ ok: false, code: "NOT_PERMITTED" });
      }
    }
    expect(await membershipOf(admin, ventureId, people.owner.userId)).toMatchObject({
      role: "owner",
      status: "active",
    });
  });

  it("rejects a change based on a stale version and changes to another venture's member", async () => {
    const a = await team(admin);
    const b = await team(admin);
    const row = await membershipOf(admin, a.ventureId, a.people.viewer.userId);
    expect(
      await changeMemberRole(a.people.owner, a.ventureId, {
        membershipId: row!.id,
        role: "operator",
        expectedVersion: row!.version + 5,
      }),
    ).toMatchObject({ ok: false, code: "CONFLICT" });

    const bRow = await membershipOf(admin, b.ventureId, b.people.viewer.userId);
    expect(
      await changeMemberRole(a.people.owner, a.ventureId, {
        membershipId: bRow!.id,
        role: "admin",
      }),
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect((await membershipOf(admin, b.ventureId, b.people.viewer.userId))!.role).toBe("viewer");
  });
});

describe("deactivation and removal", () => {
  it("suspending a member blocks access immediately; reactivating restores it", async () => {
    const { ventureId, people } = await team(admin);
    const row = await membershipOf(admin, ventureId, people.admin.userId);
    expect((await getTeam(people.admin, ventureId)).viewer.role).toBe("admin");

    expect(
      await changeMemberStatus(people.owner, ventureId, {
        membershipId: row!.id,
        change: "suspend",
      }),
    ).toEqual({ ok: true, data: undefined });
    await expect(getTeam(people.admin, ventureId)).rejects.toBeInstanceOf(VentureNotFoundError);
    await expect(resolveSelectedVenture(people.admin, ventureId)).rejects.toBeInstanceOf(
      VentureNotFoundError,
    );
    expect((await listSwitchableVentures(people.admin)).map((v) => v.id)).not.toContain(ventureId);

    expect(
      (
        await changeMemberStatus(people.owner, ventureId, {
          membershipId: row!.id,
          change: "reactivate",
        })
      ).ok,
    ).toBe(true);
    expect((await getTeam(people.admin, ventureId)).viewer.role).toBe("admin");

    const actions = (await ventureAudit(admin, ventureId)).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining(["venture.membership.deactivated", "venture.membership.activated"]),
    );
  });

  it("removing a member ends access immediately, including for background jobs", async () => {
    const { ventureId, people } = await team(admin);
    const row = await membershipOf(admin, ventureId, people.operator.userId);
    const job = {
      serviceId: "worker:export",
      ventureId,
      userId: people.operator.userId,
      capability: "venture:view" as const,
    };
    await expect(assertMembershipForJob(job)).resolves.toBe("operator");
    await expect(resolveSelectedVenture(people.operator, ventureId)).resolves.toMatchObject({
      role: "operator",
    });

    expect(
      await changeMemberStatus(people.admin, ventureId, {
        membershipId: row!.id,
        change: "remove",
      }),
    ).toEqual({ ok: true, data: undefined });

    await expect(resolveSelectedVenture(people.operator, ventureId)).rejects.toBeInstanceOf(
      VentureNotFoundError,
    );
    await expect(assertMembershipForJob(job)).rejects.toBeInstanceOf(MembershipRevokedError);
    expect((await getTeam(people.owner, ventureId)).members.map((m) => m.userId)).not.toContain(
      people.operator.userId,
    );
    expect(await membershipOf(admin, ventureId, people.operator.userId)).toMatchObject({
      status: "removed",
    });
    const [removed] = (await ventureAudit(admin, ventureId)).filter(
      (a) => a.action === "venture.membership.removed",
    );
    expect(removed).toMatchObject({
      actor_user_id: people.admin.userId,
      subject_user_id: people.operator.userId,
      metadata: { role: "operator", from: "active", to: "removed" },
    });

    // A removed member cannot be acted on again (no resurrection through status changes).
    expect(
      await changeMemberStatus(people.admin, ventureId, {
        membershipId: row!.id,
        change: "reactivate",
      }),
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("denies jobs whose user lost the capability since enqueueing", async () => {
    const { ventureId, people } = await team(admin);
    const row = await membershipOf(admin, ventureId, people.admin.userId);
    const job = {
      serviceId: "worker:team",
      ventureId,
      userId: people.admin.userId,
      capability: "team:invite" as const,
    };
    await expect(assertMembershipForJob(job)).resolves.toBe("admin");
    await changeMemberRole(people.owner, ventureId, { membershipId: row!.id, role: "viewer" });
    await expect(assertMembershipForJob(job)).rejects.toBeInstanceOf(MembershipRevokedError);
  });

  it("refuses removal by non-admins, of oneself, and of Admins by Admins", async () => {
    const { ventureId, people } = await team(admin);
    const adminRow = await membershipOf(admin, ventureId, people.admin.userId);
    const viewerRow = await membershipOf(admin, ventureId, people.viewer.userId);
    await expect(
      changeMemberStatus(people.manager, ventureId, {
        membershipId: viewerRow!.id,
        change: "remove",
      }),
    ).rejects.toBeInstanceOf(VenturePermissionError);
    expect(
      await changeMemberStatus(people.admin, ventureId, {
        membershipId: adminRow!.id,
        change: "remove",
      }),
    ).toMatchObject({ ok: false, code: "NOT_PERMITTED" });
    const second = await activeVenture(admin, { o: "owner", a1: "admin", a2: "admin" });
    const a2 = await membershipOf(admin, second.ventureId, second.people.a2.userId);
    expect(
      await changeMemberStatus(second.people.a1, second.ventureId, {
        membershipId: a2!.id,
        change: "suspend",
      }),
    ).toMatchObject({ ok: false, code: "NOT_PERMITTED" });
    expect(
      (
        await changeMemberStatus(second.people.o, second.ventureId, {
          membershipId: a2!.id,
          change: "suspend",
        })
      ).ok,
    ).toBe(true);
  });
});
