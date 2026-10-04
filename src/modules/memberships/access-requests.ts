import { and, eq, sql } from "drizzle-orm";
import { schema, withTenant, withUser, type Tx } from "@/platform/db";
import { canChangeMember, type Actor } from "@/modules/ventures";
import { grantableRole, uuidInput } from "./policy";
import {
  actorRoleIn,
  authorize,
  fail,
  recordTeamEvent,
  TeamEvents,
  tenant,
  type TeamResult,
} from "./shared";

const { ventureMemberships, ventureAccessRequests } = schema;

/**
 * Requests access to a venture the signed-in user reached by link (permission-denied
 * request-access flow, spec §12). The result is identical whether the venture exists, is
 * inactive, already includes the user, or already has a pending request from them, so the
 * flow cannot be used to discover ventures. `app.request_venture_access()` decides.
 */
export async function requestAccess(actor: Actor, ventureId: string): Promise<void> {
  const id = uuidInput.safeParse(ventureId);
  if (!id.success) return;
  await withUser({ userId: actor.userId, correlationId: actor.correlationId }, (tx) =>
    tx.execute(sql`select app.request_venture_access(${id.data}::uuid)`),
  );
}

async function loadPending(tx: Tx, ventureId: string, requestId: string) {
  const [request] = await tx
    .select({
      id: ventureAccessRequests.id,
      status: ventureAccessRequests.status,
      requesterUserId: ventureAccessRequests.requesterUserId,
    })
    .from(ventureAccessRequests)
    .where(
      and(eq(ventureAccessRequests.id, requestId), eq(ventureAccessRequests.ventureId, ventureId)),
    );
  return request;
}

/**
 * Approves a pending request and grants `role` (Owner/Admin; Admin cannot grant Admin).
 * Atomic: the reviewer's permission, the request state and the membership are all
 * re-checked and written in one transaction under RLS, with audit records.
 */
export async function approveAccessRequest(
  actor: Actor,
  ventureId: string,
  input: { requestId: unknown; role: unknown },
): Promise<TeamResult> {
  const access = await authorize(actor, ventureId, "team:invite");
  const id = uuidInput.safeParse(input.requestId);
  if (!id.success) return fail("NOT_FOUND", "This request could not be found.");
  const role = grantableRole.safeParse(input.role);
  if (!role.success) return fail("VALIDATION", "Choose a role.", { role: "Choose a role." });

  return withTenant(tenant(access), async (tx) => {
    const actorRole = await actorRoleIn(tx, access, "team:invite");
    if (!canChangeMember({ actorRole, targetRole: role.data, isSelf: false })) {
      return fail("NOT_PERMITTED", "You cannot grant this role.", {
        role: "Choose a role you are allowed to assign.",
      });
    }
    const request = await loadPending(tx, access.id, id.data);
    if (!request) return fail("NOT_FOUND", "This request could not be found.");
    if (request.status !== "pending") {
      return fail("INVALID_STATE", "This request has already been reviewed.");
    }

    const [existing] = await tx
      .select({
        id: ventureMemberships.id,
        role: ventureMemberships.role,
        status: ventureMemberships.status,
      })
      .from(ventureMemberships)
      .where(
        and(
          eq(ventureMemberships.ventureId, access.id),
          eq(ventureMemberships.userId, request.requesterUserId),
        ),
      );
    if (existing?.status === "active") {
      return fail("ALREADY_MEMBER", "This person is already a member. Reject the request instead.");
    }
    if (existing?.status === "suspended") {
      return fail(
        "MEMBER_SUSPENDED",
        "This person is a suspended member. Reactivate them instead.",
      );
    }

    let membershipId: string;
    let action: string;
    if (existing) {
      // A previously removed member rejoins: RLS also requires the actor to manage the
      // role they held before.
      if (!canChangeMember({ actorRole, targetRole: existing.role, isSelf: false })) {
        return fail("NOT_PERMITTED", "You do not have permission to restore this member.");
      }
      const [row] = await tx
        .update(ventureMemberships)
        .set({ role: role.data, status: "active" })
        .where(
          and(eq(ventureMemberships.id, existing.id), eq(ventureMemberships.status, "removed")),
        )
        .returning({ id: ventureMemberships.id });
      if (!row) return fail("CONFLICT", "This person's membership changed. Reload the page.");
      membershipId = row.id;
      action = TeamEvents.membershipReactivated;
    } else {
      const [row] = await tx
        .insert(ventureMemberships)
        .values({
          ventureId: access.id,
          userId: request.requesterUserId,
          role: role.data,
          invitedBy: access.userId,
        })
        .returning({ id: ventureMemberships.id });
      membershipId = row!.id;
      action = TeamEvents.membershipCreated;
    }

    const [reviewed] = await tx
      .update(ventureAccessRequests)
      .set({
        status: "approved",
        grantedRole: role.data,
        reviewedBy: access.userId,
        reviewedAt: sql`now()`,
      })
      .where(
        and(eq(ventureAccessRequests.id, request.id), eq(ventureAccessRequests.status, "pending")),
      )
      .returning({ id: ventureAccessRequests.id });
    if (!reviewed) {
      // Raced with another reviewer: throw so the membership write rolls back too.
      throw new AccessRequestConflictError();
    }

    await recordTeamEvent(tx, access, {
      action: TeamEvents.accessRequestApproved,
      targetType: "access_request",
      targetId: request.id,
      subjectUserId: request.requesterUserId,
      metadata: { role: role.data },
    });
    await recordTeamEvent(tx, access, {
      action,
      targetType: "membership",
      targetId: membershipId,
      subjectUserId: request.requesterUserId,
      metadata: { role: role.data, source: "access_request", accessRequestId: request.id },
    });
    return { ok: true as const, data: undefined };
  }).catch((error: unknown) => {
    if (error instanceof AccessRequestConflictError) {
      return fail("INVALID_STATE", "This request has already been reviewed.");
    }
    throw error;
  });
}

class AccessRequestConflictError extends Error {}

/** Rejects a pending request. The requester is not told (no venture disclosure). */
export async function rejectAccessRequest(
  actor: Actor,
  ventureId: string,
  input: { requestId: unknown },
): Promise<TeamResult> {
  const access = await authorize(actor, ventureId, "team:invite");
  const id = uuidInput.safeParse(input.requestId);
  if (!id.success) return fail("NOT_FOUND", "This request could not be found.");
  return withTenant(tenant(access), async (tx) => {
    await actorRoleIn(tx, access, "team:invite");
    const request = await loadPending(tx, access.id, id.data);
    if (!request) return fail("NOT_FOUND", "This request could not be found.");
    if (request.status !== "pending") {
      return fail("INVALID_STATE", "This request has already been reviewed.");
    }
    const [reviewed] = await tx
      .update(ventureAccessRequests)
      .set({ status: "rejected", reviewedBy: access.userId, reviewedAt: sql`now()` })
      .where(
        and(eq(ventureAccessRequests.id, request.id), eq(ventureAccessRequests.status, "pending")),
      )
      .returning({ id: ventureAccessRequests.id });
    if (!reviewed) return fail("INVALID_STATE", "This request has already been reviewed.");
    await recordTeamEvent(tx, access, {
      action: TeamEvents.accessRequestRejected,
      targetType: "access_request",
      targetId: request.id,
      subjectUserId: request.requesterUserId,
    });
    return { ok: true as const, data: undefined };
  });
}
