import { and, eq } from "drizzle-orm";
import { schema, type Tx } from "@/platform/db";
import {
  can,
  resolveSelectedVenture,
  rolesWith,
  VentureNotFoundError,
  VenturePermissionError,
  type Actor,
  type Capability,
  type VentureAccess,
  type VentureRole,
} from "@/modules/ventures";

const { auditLog, ventureMemberships } = schema;

export type TeamErrorCode =
  | "VALIDATION"
  | "NOT_PERMITTED"
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "CONFLICT"
  | "DUPLICATE"
  | "ALREADY_MEMBER"
  | "MEMBER_SUSPENDED"
  | "LIMIT";

export type TeamResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: TeamErrorCode; message: string; fieldErrors?: Record<string, string> };

export const fail = (
  code: TeamErrorCode,
  message: string,
  fieldErrors?: Record<string, string>,
): TeamResult<never> => ({ ok: false, code, message, ...(fieldErrors ? { fieldErrors } : {}) });

export const tenant = (access: VentureAccess) => ({
  userId: access.userId,
  ventureId: access.id,
  correlationId: access.correlationId,
});

/**
 * Resolves an active venture for a team action. Membership, role and capability are read
 * from the database on every call; RLS re-checks the role on every statement.
 */
export function authorize(actor: Actor, ventureId: string, capability: Capability) {
  return resolveSelectedVenture(actor, ventureId, capability);
}

/**
 * Re-reads the actor's role inside the mutation transaction, so a role change or removal
 * that commits between the request check and the mutation is honoured.
 */
export async function actorRoleIn(
  tx: Tx,
  access: VentureAccess,
  capability: Capability,
): Promise<VentureRole> {
  const [row] = await tx
    .select({ role: ventureMemberships.role })
    .from(ventureMemberships)
    .where(
      and(
        eq(ventureMemberships.ventureId, access.id),
        eq(ventureMemberships.userId, access.userId),
        eq(ventureMemberships.status, "active"),
      ),
    );
  if (!row) throw new VentureNotFoundError();
  if (!can(row.role, capability)) throw new VenturePermissionError(rolesWith(capability));
  return row.role;
}

export async function recordTeamEvent(
  tx: Tx,
  access: VentureAccess,
  event: {
    action: string;
    targetType: "membership" | "invitation" | "access_request";
    targetId: string;
    subjectUserId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await tx.insert(auditLog).values({
    ventureId: access.id,
    actorType: "user",
    actorUserId: access.userId,
    subjectUserId: event.subjectUserId ?? null,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    metadata: event.metadata ?? {},
    correlationId: access.correlationId ?? null,
  });
}

/** Canonical team audit actions (ADR-0013). Metadata never contains tokens or emails. */
export const TeamEvents = {
  invitationCreated: "venture.invitation.created",
  invitationRevoked: "venture.invitation.revoked",
  invitationExpired: "venture.invitation.expired",
  invitationAccepted: "venture.invitation.accepted", // written by app.accept_venture_invitation
  invitationAcceptFailed: "venture.invitation.accept_failed",
  accessRequestCreated: "venture.access_request.created", // written by app.request_venture_access
  accessRequestApproved: "venture.access_request.approved",
  accessRequestRejected: "venture.access_request.rejected",
  membershipCreated: "venture.membership.created",
  membershipReactivated: "venture.membership.reactivated",
  membershipRoleChanged: "venture.membership.role_changed",
  membershipDeactivated: "venture.membership.deactivated",
  membershipActivated: "venture.membership.activated",
  membershipRemoved: "venture.membership.removed",
} as const;
