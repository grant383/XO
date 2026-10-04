import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { schema, withTenant, type Tx } from "@/platform/db";
import {
  assignableRoles,
  canChangeMember,
  capabilitiesOf,
  type Actor,
  type Capability,
  type VentureAccess,
  type VentureRole,
} from "@/modules/ventures";
import { grantableRole, uuidInput, versionInput } from "./policy";
import {
  actorRoleIn,
  authorize,
  fail,
  recordTeamEvent,
  TeamEvents,
  tenant,
  type TeamResult,
} from "./shared";

const { users, ventureMemberships, ventureInvitations, ventureAccessRequests } = schema;

export type MembershipStatus = "active" | "suspended" | "removed";

export type TeamMember = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: VentureRole;
  status: MembershipStatus;
  version: number;
  joinedAt: Date;
  isSelf: boolean;
  /** Whether the viewing actor may change this member (role, suspend, remove). */
  manageable: boolean;
};

export type PendingInvitation = {
  id: string;
  email: string;
  role: VentureRole;
  invitedByName: string | null;
  createdAt: Date;
  expiresAt: Date;
  expired: boolean;
  manageable: boolean;
};

export type PendingAccessRequest = {
  id: string;
  requesterName: string;
  requesterEmail: string;
  requestedAt: Date;
};

export type TeamView = {
  venture: { id: string; name: string };
  viewer: {
    userId: string;
    role: VentureRole;
    capabilities: Capability[];
    assignableRoles: VentureRole[];
  };
  members: TeamMember[];
  invitations: PendingInvitation[];
  accessRequests: PendingAccessRequest[];
};

const ROLE_ORDER = sql`array_position(array['owner','admin','manager','operator','viewer']::venture_role[], ${ventureMemberships.role})`;

/** Team and Permissions read model (spec §8: Admin+). */
export async function getTeam(actor: Actor, ventureId: string): Promise<TeamView> {
  const access = await authorize(actor, ventureId, "team:view");
  return withTenant(tenant(access), async (tx) => {
    const role = await actorRoleIn(tx, access, "team:view");
    const members = await tx
      .select({
        membershipId: ventureMemberships.id,
        userId: ventureMemberships.userId,
        name: users.name,
        email: users.email,
        role: ventureMemberships.role,
        status: ventureMemberships.status,
        version: ventureMemberships.version,
        joinedAt: ventureMemberships.createdAt,
      })
      .from(ventureMemberships)
      .innerJoin(users, eq(users.id, ventureMemberships.userId))
      .where(
        and(eq(ventureMemberships.ventureId, access.id), ne(ventureMemberships.status, "removed")),
      )
      .orderBy(ROLE_ORDER, asc(users.name), asc(ventureMemberships.id));

    const invitations = await tx
      .select({
        id: ventureInvitations.id,
        email: ventureInvitations.email,
        role: ventureInvitations.role,
        invitedByName: users.name,
        createdAt: ventureInvitations.createdAt,
        expiresAt: ventureInvitations.expiresAt,
      })
      .from(ventureInvitations)
      .leftJoin(users, eq(users.id, ventureInvitations.invitedBy))
      .where(
        and(eq(ventureInvitations.ventureId, access.id), eq(ventureInvitations.status, "pending")),
      )
      .orderBy(desc(ventureInvitations.createdAt), asc(ventureInvitations.id));

    const requests = await tx
      .select({
        id: ventureAccessRequests.id,
        requesterName: ventureAccessRequests.requesterName,
        requesterEmail: ventureAccessRequests.requesterEmail,
        requestedAt: ventureAccessRequests.createdAt,
      })
      .from(ventureAccessRequests)
      .where(
        and(
          eq(ventureAccessRequests.ventureId, access.id),
          eq(ventureAccessRequests.status, "pending"),
        ),
      )
      .orderBy(asc(ventureAccessRequests.createdAt), asc(ventureAccessRequests.id));

    const now = Date.now();
    return {
      venture: { id: access.id, name: access.name },
      viewer: {
        userId: access.userId,
        role,
        capabilities: capabilitiesOf(role),
        assignableRoles: assignableRoles(role),
      },
      members: members.map((m) => {
        const isSelf = m.userId === access.userId;
        return {
          ...m,
          isSelf,
          manageable: canChangeMember({ actorRole: role, targetRole: m.role, isSelf }),
        };
      }),
      invitations: invitations.map((i) => ({
        ...i,
        expired: i.expiresAt.getTime() <= now,
        manageable: canChangeMember({ actorRole: role, targetRole: i.role, isSelf: false }),
      })),
      accessRequests: requests,
    };
  });
}

type Target = { id: string; userId: string; role: VentureRole; status: MembershipStatus };

/**
 * Shared shape of every member mutation: authorise the capability, re-read the actor's
 * role in the transaction, load the target in this venture only, apply the RBAC rule,
 * then write under RLS (which re-checks the role rules) with an audit record.
 */
async function mutateMember<T>(
  actor: Actor,
  ventureId: string,
  membershipId: unknown,
  capability: Capability,
  apply: (ctx: {
    tx: Tx;
    access: VentureAccess;
    actorRole: VentureRole;
    target: Target;
  }) => Promise<TeamResult<T>>,
): Promise<TeamResult<T>> {
  const access = await authorize(actor, ventureId, capability);
  const id = uuidInput.safeParse(membershipId);
  if (!id.success) return fail("NOT_FOUND", "This member could not be found.");
  return withTenant(tenant(access), async (tx) => {
    const actorRole = await actorRoleIn(tx, access, capability);
    const [target] = await tx
      .select({
        id: ventureMemberships.id,
        userId: ventureMemberships.userId,
        role: ventureMemberships.role,
        status: ventureMemberships.status,
      })
      .from(ventureMemberships)
      .where(and(eq(ventureMemberships.id, id.data), eq(ventureMemberships.ventureId, access.id)));
    if (!target || target.status === "removed") {
      return fail("NOT_FOUND", "This member could not be found.");
    }
    return apply({ tx, access, actorRole, target });
  });
}

const notPermitted = () =>
  fail("NOT_PERMITTED", "You do not have permission to change this member.");
const conflict = () =>
  fail("CONFLICT", "This member was changed by someone else. Reload the page and try again.");

/**
 * Changes a member's role. Owner manages every non-owner role; Admin manages Manager,
 * Operator and Viewer; nobody changes their own role or assigns Owner. `expectedVersion`
 * (optimistic concurrency) rejects changes based on a stale view.
 */
export async function changeMemberRole(
  actor: Actor,
  ventureId: string,
  input: { membershipId: unknown; role: unknown; expectedVersion?: unknown },
): Promise<TeamResult<{ version: number }>> {
  const role = grantableRole.safeParse(input.role);
  if (!role.success) return fail("VALIDATION", "Choose a role.", { role: "Choose a role." });
  const version = versionInput.safeParse(input.expectedVersion);
  if (!version.success) return conflict();

  return mutateMember(actor, ventureId, input.membershipId, "team:update_role", async (c) => {
    const { tx, access, actorRole, target } = c;
    const isSelf = target.userId === access.userId;
    if (!canChangeMember({ actorRole, targetRole: target.role, isSelf, nextRole: role.data })) {
      return notPermitted();
    }
    if (target.role === role.data) {
      return fail("VALIDATION", "This member already has that role.", {
        role: "Choose a different role.",
      });
    }
    const conditions = [
      eq(ventureMemberships.id, target.id),
      eq(ventureMemberships.ventureId, access.id),
    ];
    if (version.data !== undefined) conditions.push(eq(ventureMemberships.version, version.data));
    const [updated] = await tx
      .update(ventureMemberships)
      .set({ role: role.data })
      .where(and(...conditions))
      .returning({ version: ventureMemberships.version });
    if (!updated) return conflict();
    await recordTeamEvent(tx, access, {
      action: TeamEvents.membershipRoleChanged,
      targetType: "membership",
      targetId: target.id,
      subjectUserId: target.userId,
      metadata: { from: target.role, to: role.data },
    });
    return { ok: true, data: { version: updated.version } };
  });
}

const STATUS_CHANGES = {
  suspend: { from: ["active"], to: "suspended", action: TeamEvents.membershipDeactivated },
  reactivate: { from: ["suspended"], to: "active", action: TeamEvents.membershipActivated },
  remove: { from: ["active", "suspended"], to: "removed", action: TeamEvents.membershipRemoved },
} as const satisfies Record<
  string,
  { from: readonly MembershipStatus[]; to: MembershipStatus; action: string }
>;

export type MemberStatusChange = keyof typeof STATUS_CHANGES;

/**
 * Suspends (deactivates), reactivates or removes a member. The change applies to the
 * member's next request: every access check and RLS policy reads membership status live.
 */
export async function changeMemberStatus(
  actor: Actor,
  ventureId: string,
  input: { membershipId: unknown; change: MemberStatusChange; expectedVersion?: unknown },
): Promise<TeamResult> {
  const spec = STATUS_CHANGES[input.change];
  const version = versionInput.safeParse(input.expectedVersion);
  if (!version.success) return conflict();

  return mutateMember(actor, ventureId, input.membershipId, "team:remove", async (c) => {
    const { tx, access, actorRole, target } = c;
    const isSelf = target.userId === access.userId;
    if (!canChangeMember({ actorRole, targetRole: target.role, isSelf })) return notPermitted();
    if (!(spec.from as readonly MembershipStatus[]).includes(target.status)) {
      return fail("INVALID_STATE", "This member's access has already changed. Reload the page.");
    }
    const conditions = [
      eq(ventureMemberships.id, target.id),
      eq(ventureMemberships.ventureId, access.id),
      eq(ventureMemberships.status, target.status),
    ];
    if (version.data !== undefined) conditions.push(eq(ventureMemberships.version, version.data));
    const [updated] = await tx
      .update(ventureMemberships)
      .set({ status: spec.to })
      .where(and(...conditions))
      .returning({ id: ventureMemberships.id });
    if (!updated) return conflict();
    await recordTeamEvent(tx, access, {
      action: spec.action,
      targetType: "membership",
      targetId: target.id,
      subjectUserId: target.userId,
      metadata: { role: target.role, from: target.status, to: spec.to },
    });
    return { ok: true, data: undefined };
  });
}
