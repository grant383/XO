"use server";

import { requestAccess } from "@/modules/memberships";
import { requireActor } from "../../../actor";

export type RequestAccessState = { status: "idle" } | { status: "sent" };

/**
 * Always reports the same outcome: whether the venture exists, is active, already includes
 * the user or already has their pending request is never revealed.
 */
export async function requestAccessAction(ventureId: string): Promise<RequestAccessState> {
  const actor = await requireActor(`/v/${ventureId}/request-access`);
  await requestAccess(actor, ventureId);
  return { status: "sent" };
}
