import { z } from "zod";
import { isVentureRole, type VentureRole } from "@/modules/ventures";

/**
 * Team policy (ADR-0013). Changing a value here is a security decision: record it in the ADR.
 */
export const INVITATION_POLICY = {
  /** Invitation links expire after this long (single use; revocable before then). */
  ttlSec: 7 * 24 * 60 * 60,
  /** Live invitations per venture, bounding invitation email volume. */
  maxPendingPerVenture: 50,
} as const;

/** Pending access requests per requester (enforced silently in `app.request_venture_access`). */
export const ACCESS_REQUEST_POLICY = { maxPendingPerRequester: 10 } as const;

const email = z.string().trim().toLowerCase().pipe(z.email().max(320));

/** A role that can be granted through the team flows (never Owner). */
export const grantableRole = z
  .string()
  .refine((v): v is Exclude<VentureRole, "owner"> => isVentureRole(v) && v !== "owner", {
    message: "Choose a role.",
  });

export const invitationInput = z.object({
  email,
  role: grantableRole,
});
export type InvitationInput = z.input<typeof invitationInput>;

export const uuidInput = z.uuid();
export const versionInput = z.coerce.number().int().min(1).optional();
