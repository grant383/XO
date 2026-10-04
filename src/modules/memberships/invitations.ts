import { and, count, eq, inArray, lte, sql } from "drizzle-orm";
import { pgCode, schema, withTenant, withUser } from "@/platform/db";
import { appEnv } from "@/platform/config/env";
import { sendEmail } from "@/platform/email";
import { logger } from "@/platform/observability/logger";
import { canChangeMember, ROLE_LABELS, type Actor, type VentureRole } from "@/modules/ventures";
import { invitationEmail } from "./emails";
import { INVITATION_POLICY, invitationInput, uuidInput } from "./policy";
import {
  actorRoleIn,
  authorize,
  fail,
  recordTeamEvent,
  TeamEvents,
  tenant,
  type TeamResult,
} from "./shared";
import {
  generateInvitationToken,
  hashInvitationToken,
  invitationPath,
  isWellFormedInvitationToken,
} from "./tokens";

const { users, ventureMemberships, ventureInvitations, auditLog } = schema;

function fieldErrorsOf(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= key === "email" ? "Enter a valid email address." : issue.message;
  }
  return out;
}

/**
 * Invites someone to the venture by email (Owner/Admin; Admin cannot invite Admins).
 * Only a digest of the single-use token is stored; the raw token goes into the email and
 * nowhere else. The invitee need not have an account yet.
 */
export async function createInvitation(
  actor: Actor,
  ventureId: string,
  input: unknown,
): Promise<TeamResult<{ invitationId: string; emailSent: boolean }>> {
  const access = await authorize(actor, ventureId, "team:invite");
  const parsed = invitationInput.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "Check the highlighted fields.", fieldErrorsOf(parsed.error));
  }
  const { email, role } = parsed.data;
  const { token, tokenHash } = generateInvitationToken();
  const expiresAt = new Date(Date.now() + INVITATION_POLICY.ttlSec * 1000);

  const outcome = await withTenant(tenant(access), async (tx) => {
    const actorRole = await actorRoleIn(tx, access, "team:invite");
    if (!canChangeMember({ actorRole, targetRole: role, isSelf: false })) {
      return fail("NOT_PERMITTED", "You cannot invite someone with this role.", {
        role: "Choose a role you are allowed to assign.",
      });
    }

    // Lapsed invitations stop blocking a new one for the same address.
    const expired = await tx
      .update(ventureInvitations)
      .set({ status: "expired" })
      .where(
        and(
          eq(ventureInvitations.ventureId, access.id),
          eq(ventureInvitations.status, "pending"),
          lte(ventureInvitations.expiresAt, sql`now()`),
        ),
      )
      .returning({ id: ventureInvitations.id });
    for (const row of expired) {
      await recordTeamEvent(tx, access, {
        action: TeamEvents.invitationExpired,
        targetType: "invitation",
        targetId: row.id,
      });
    }

    // Existing active/suspended members are co-members, so the inviter can already see them.
    const [member] = await tx
      .select({ status: ventureMemberships.status })
      .from(ventureMemberships)
      .innerJoin(users, eq(users.id, ventureMemberships.userId))
      .where(
        and(
          eq(ventureMemberships.ventureId, access.id),
          inArray(ventureMemberships.status, ["active", "suspended"]),
          sql`lower(${users.email}::text) = ${email}`,
        ),
      );
    if (member) {
      return fail(
        "ALREADY_MEMBER",
        member.status === "suspended"
          ? "This person is a suspended member. Reactivate them instead."
          : "This person is already a member of this venture.",
        { email: "Already a member." },
      );
    }

    const [{ pending }] = (await tx
      .select({ pending: count() })
      .from(ventureInvitations)
      .where(
        and(eq(ventureInvitations.ventureId, access.id), eq(ventureInvitations.status, "pending")),
      )) as [{ pending: number }];
    if (pending >= INVITATION_POLICY.maxPendingPerVenture) {
      return fail("LIMIT", "There are too many pending invitations. Revoke some and try again.");
    }

    // The partial unique index allows one pending invitation per address. ON CONFLICT keeps
    // the transaction usable (a failed INSERT would abort it).
    const [row] = await tx
      .insert(ventureInvitations)
      .values({
        ventureId: access.id,
        email,
        role,
        tokenHash,
        invitedBy: access.userId,
        expiresAt,
      })
      .onConflictDoNothing({
        target: [ventureInvitations.ventureId, ventureInvitations.email],
        where: sql`status = 'pending'`,
      })
      .returning({ id: ventureInvitations.id });
    if (!row) {
      return fail(
        "DUPLICATE",
        "An invitation is already pending for this address. Revoke it to send a new one.",
        { email: "Already invited." },
      );
    }
    const invitationId = row.id;
    await recordTeamEvent(tx, access, {
      action: TeamEvents.invitationCreated,
      targetType: "invitation",
      targetId: invitationId,
      metadata: { role, expiresAt: expiresAt.toISOString() },
    });
    const [inviter] = await tx
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, access.userId));
    return {
      ok: true as const,
      data: { invitationId, inviterName: inviter?.name ?? "A colleague" },
    };
  });
  if (!outcome.ok) return outcome;

  // Sent after commit: a delivery failure leaves a valid invitation the inviter can revoke
  // and re-send, and never rolls back the audit record.
  let emailSent = true;
  try {
    await sendEmail(
      invitationEmail({
        to: email,
        inviterName: outcome.data.inviterName,
        ventureName: access.name,
        roleLabel: ROLE_LABELS[role],
        url: `${appEnv().APP_URL}${invitationPath(token)}`,
        ttlDays: Math.round(INVITATION_POLICY.ttlSec / 86_400),
      }),
    );
  } catch {
    emailSent = false;
  }
  return { ok: true, data: { invitationId: outcome.data.invitationId, emailSent } };
}

/** Revokes a pending invitation; its link stops working immediately. */
export async function revokeInvitation(
  actor: Actor,
  ventureId: string,
  invitationId: unknown,
): Promise<TeamResult> {
  const access = await authorize(actor, ventureId, "team:invite");
  const id = uuidInput.safeParse(invitationId);
  if (!id.success) return fail("NOT_FOUND", "This invitation could not be found.");
  return withTenant(tenant(access), async (tx) => {
    const actorRole = await actorRoleIn(tx, access, "team:invite");
    const [invitation] = await tx
      .select({ role: ventureInvitations.role, status: ventureInvitations.status })
      .from(ventureInvitations)
      .where(and(eq(ventureInvitations.id, id.data), eq(ventureInvitations.ventureId, access.id)));
    if (!invitation) return fail("NOT_FOUND", "This invitation could not be found.");
    if (!canChangeMember({ actorRole, targetRole: invitation.role, isSelf: false })) {
      return fail("NOT_PERMITTED", "You do not have permission to revoke this invitation.");
    }
    if (invitation.status !== "pending") {
      return fail("INVALID_STATE", "This invitation is no longer pending.");
    }
    const [updated] = await tx
      .update(ventureInvitations)
      .set({ status: "revoked", revokedAt: sql`now()`, revokedBy: access.userId })
      .where(
        and(
          eq(ventureInvitations.id, id.data),
          eq(ventureInvitations.ventureId, access.id),
          eq(ventureInvitations.status, "pending"),
        ),
      )
      .returning({ id: ventureInvitations.id });
    if (!updated) return fail("INVALID_STATE", "This invitation is no longer pending.");
    await recordTeamEvent(tx, access, {
      action: TeamEvents.invitationRevoked,
      targetType: "invitation",
      targetId: updated.id,
      metadata: { role: invitation.role },
    });
    return { ok: true as const, data: undefined };
  });
}

// ---------------------------------------------------------------------------
// Invitee side
// ---------------------------------------------------------------------------

export type InvitationPreview =
  | {
      state: "valid" | "already_member";
      ventureId: string;
      ventureName: string;
      role: VentureRole;
      inviterName: string | null;
      expiresAt: Date;
    }
  | { state: "invalid" | "expired" | "wrong_account" | "suspended" };

/**
 * What the signed-in token holder may see about an invitation. Details are disclosed only
 * to the account the invitation was addressed to.
 */
export async function previewInvitation(actor: Actor, token: unknown): Promise<InvitationPreview> {
  if (!isWellFormedInvitationToken(token)) return { state: "invalid" };
  const rows = await withUser({ userId: actor.userId }, (tx) =>
    tx.execute<{
      state: string;
      venture_id: string | null;
      venture_name: string | null;
      role: VentureRole | null;
      inviter_name: string | null;
      expires_at: string | Date | null;
    }>(sql`select * from app.preview_venture_invitation(${hashInvitationToken(token)})`),
  );
  const row = rows[0];
  if (!row) return { state: "invalid" };
  if ((row.state === "valid" || row.state === "already_member") && row.venture_id) {
    return {
      state: row.state,
      ventureId: row.venture_id,
      ventureName: row.venture_name ?? "",
      role: row.role!,
      inviterName: row.inviter_name,
      expiresAt: new Date(row.expires_at!),
    };
  }
  if (row.state === "expired" || row.state === "wrong_account" || row.state === "suspended") {
    return { state: row.state };
  }
  return { state: "invalid" };
}

export type AcceptFailure =
  "INVALID" | "EXPIRED" | "WRONG_ACCOUNT" | "ALREADY_MEMBER" | "SUSPENDED";

const ACCEPT_ERRORS: Record<string, AcceptFailure> = {
  DXM01: "INVALID",
  DXM02: "EXPIRED",
  DXM03: "WRONG_ACCOUNT",
  DXM04: "ALREADY_MEMBER",
  DXM05: "SUSPENDED",
};

export const ACCEPT_MESSAGES: Record<AcceptFailure, string> = {
  INVALID: "This invitation is invalid, has been revoked or has already been used.",
  EXPIRED: "This invitation has expired. Ask the person who invited you to send a new one.",
  WRONG_ACCOUNT:
    "This invitation was sent to a different email address. Sign in with that address to accept it.",
  ALREADY_MEMBER: "You are already a member of this venture.",
  SUSPENDED: "Your access to this venture is suspended. Contact a venture administrator.",
};

/**
 * Accepts an invitation for the signed-in, email-verified user through
 * `app.accept_venture_invitation()`, which validates and creates the membership in one
 * transaction. Failures leave no membership and are recorded as account-level events.
 */
export async function acceptInvitation(
  actor: Actor,
  token: unknown,
): Promise<{ ok: true; ventureId: string } | { ok: false; code: AcceptFailure; message: string }> {
  let code: AcceptFailure = "INVALID";
  if (isWellFormedInvitationToken(token)) {
    try {
      const rows = await withUser(
        { userId: actor.userId, correlationId: actor.correlationId },
        (tx) =>
          tx.execute<{ venture_id: string }>(
            sql`select app.accept_venture_invitation(${hashInvitationToken(token)}) as venture_id`,
          ),
      );
      return { ok: true, ventureId: rows[0]!.venture_id };
    } catch (error) {
      const mapped = ACCEPT_ERRORS[pgCode(error) ?? ""];
      if (!mapped) throw error;
      code = mapped;
    }
  }
  try {
    await withUser({ userId: actor.userId, correlationId: actor.correlationId }, (tx) =>
      tx.insert(auditLog).values({
        actorType: "user",
        actorUserId: actor.userId,
        subjectUserId: actor.userId,
        action: TeamEvents.invitationAcceptFailed,
        targetType: "invitation",
        outcome: "failure",
        metadata: { reason: code },
        correlationId: actor.correlationId ?? null,
      }),
    );
  } catch (error) {
    logger.error(
      {
        audit: { action: TeamEvents.invitationAcceptFailed },
        err: { name: (error as Error).name },
      },
      "audit write failed",
    );
  }
  return { ok: false, code, message: ACCEPT_MESSAGES[code] };
}
