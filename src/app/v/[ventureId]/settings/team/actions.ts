"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  approveAccessRequest,
  changeMemberRole,
  changeMemberStatus,
  createInvitation,
  rejectAccessRequest,
  revokeInvitation,
  type MemberStatusChange,
  type TeamResult,
} from "@/modules/memberships";
import {
  VentureNotFoundError,
  VenturePermissionError,
  VentureStateError,
} from "@/modules/ventures";
import { requireActor } from "../../../../actor";
import type { TeamFormState } from "./form-state";

/**
 * Every action is an untrusted entry point: it re-authenticates, and the memberships module
 * re-authorises the capability, re-reads the actor's role inside the transaction and writes
 * under RLS. Form values (ids, roles, versions) are only references.
 */
const text = (data: FormData, name: string) => {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
};

const teamPath = (ventureId: string) => `/v/${ventureId}/settings/team`;

function accessFailure(error: unknown): TeamFormState {
  if (error instanceof VentureNotFoundError) {
    return { status: "error", message: "You no longer have access to this venture." };
  }
  if (error instanceof VenturePermissionError) {
    return { status: "error", message: "You do not have permission to manage this team." };
  }
  if (error instanceof VentureStateError) redirect("/");
  throw error;
}

async function run(
  ventureId: string,
  successMessage: string,
  operation: (actor: Awaited<ReturnType<typeof requireActor>>) => Promise<TeamResult<unknown>>,
  values?: Record<string, string>,
): Promise<TeamFormState> {
  const actor = await requireActor(teamPath(ventureId));
  let result: TeamResult<unknown>;
  try {
    result = await operation(actor);
  } catch (error) {
    return accessFailure(error);
  }
  revalidatePath(teamPath(ventureId));
  if (!result.ok) {
    return { status: "error", message: result.message, fieldErrors: result.fieldErrors, values };
  }
  return { status: "success", message: successMessage };
}

export async function inviteMemberAction(
  ventureId: string,
  _prev: TeamFormState,
  data: FormData,
): Promise<TeamFormState> {
  const values = { email: text(data, "email"), role: text(data, "role") };
  const actor = await requireActor(teamPath(ventureId));
  try {
    const result = await createInvitation(actor, ventureId, values);
    revalidatePath(teamPath(ventureId));
    if (!result.ok) {
      return { status: "error", message: result.message, fieldErrors: result.fieldErrors, values };
    }
    return {
      status: "success",
      message: result.data.emailSent
        ? `Invitation sent to ${values.email.trim().toLowerCase()}.`
        : "The invitation was created, but the email could not be sent. Revoke it and try again later.",
    };
  } catch (error) {
    return accessFailure(error);
  }
}

export async function revokeInvitationAction(
  ventureId: string,
  _prev: TeamFormState,
  data: FormData,
): Promise<TeamFormState> {
  return run(ventureId, "Invitation revoked.", (actor) =>
    revokeInvitation(actor, ventureId, text(data, "invitationId")),
  );
}

export async function changeRoleAction(
  ventureId: string,
  _prev: TeamFormState,
  data: FormData,
): Promise<TeamFormState> {
  return run(ventureId, "Role updated.", (actor) =>
    changeMemberRole(actor, ventureId, {
      membershipId: text(data, "membershipId"),
      role: text(data, "role"),
      expectedVersion: text(data, "version") || undefined,
    }),
  );
}

const STATUS_MESSAGES: Record<MemberStatusChange, string> = {
  suspend: "Member suspended. Their access ended immediately.",
  reactivate: "Member reactivated.",
  remove: "Member removed. Their access ended immediately.",
};

export async function changeStatusAction(
  ventureId: string,
  _prev: TeamFormState,
  data: FormData,
): Promise<TeamFormState> {
  const change = text(data, "change");
  if (change !== "suspend" && change !== "reactivate" && change !== "remove") {
    return { status: "error", message: "Choose an action." };
  }
  return run(ventureId, STATUS_MESSAGES[change], (actor) =>
    changeMemberStatus(actor, ventureId, {
      membershipId: text(data, "membershipId"),
      change,
      expectedVersion: text(data, "version") || undefined,
    }),
  );
}

export async function approveRequestAction(
  ventureId: string,
  _prev: TeamFormState,
  data: FormData,
): Promise<TeamFormState> {
  return run(ventureId, "Access request approved.", (actor) =>
    approveAccessRequest(actor, ventureId, {
      requestId: text(data, "requestId"),
      role: text(data, "role"),
    }),
  );
}

export async function rejectRequestAction(
  ventureId: string,
  _prev: TeamFormState,
  data: FormData,
): Promise<TeamFormState> {
  return run(ventureId, "Access request rejected.", (actor) =>
    rejectAccessRequest(actor, ventureId, { requestId: text(data, "requestId") }),
  );
}
