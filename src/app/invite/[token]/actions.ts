"use server";

import { randomUUID } from "node:crypto";
import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CORRELATION_HEADER, logout, withNext } from "@/modules/identity";
import {
  acceptInvitation,
  invitationPath,
  isWellFormedInvitationToken,
} from "@/modules/memberships";
import { requireActor } from "../../actor";

export type AcceptState = { status: "idle" } | { status: "error"; message: string };

/**
 * Accepts on an explicit POST only (never on page load), so link-scanning mail gateways
 * cannot consume the single-use token. The token is re-validated in the database.
 */
export async function acceptInvitationAction(token: string): Promise<AcceptState> {
  const actor = await requireActor(
    isWellFormedInvitationToken(token) ? invitationPath(token) : undefined,
  );
  const result = await acceptInvitation(actor, token);
  if (!result.ok) return { status: "error", message: result.message };
  redirect("/?joined=1");
}

/** Signs out so the invitee can sign in with the invited address, then returns here. */
export async function switchAccountAction(token: string): Promise<void> {
  const h = new Headers(await headers());
  if (!h.get(CORRELATION_HEADER)) h.set(CORRELATION_HEADER, randomUUID());
  await logout(h);
  redirect(
    withNext(
      "/auth/login",
      isWellFormedInvitationToken(token) ? invitationPath(token) : undefined,
    ) as Route,
  );
}
