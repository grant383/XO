import { z } from "zod";
export const inboxQuery = z
  .object({
    unread: z.boolean().default(false),
    cursor: z.object({ at: z.iso.datetime(), id: z.uuid() }).optional(),
  })
  .strict();
export const readInput = z.object({ id: z.uuid().optional(), through: z.iso.datetime() }).strict();
export const EVENT_LABELS: Record<string, string> = {
  "auth.user.registered": "Account created",
  "auth.email.verified": "Email verified",
  "auth.login.succeeded": "Signed in",
  "auth.login.failed": "Sign-in attempt failed",
  "auth.logout": "Signed out",
  "auth.password.changed": "Password changed",
  "auth.password_reset.completed": "Password reset",
  "auth.mfa.enabled": "Authenticator enabled",
  "auth.mfa.disabled": "Authenticator disabled",
  "auth.mfa.recovery_codes_regenerated": "Backup codes regenerated",
  "auth.session.revoked": "Device signed out",
  "auth.session.created": "Session started",
  "auth.session.expired": "Session expired",
  "auth.profile.updated": "Profile updated",
  "auth.mfa.failed": "Authenticator check failed",
  "auth.password_reset.requested": "Password reset requested",
  "support.request.created": "Support request submitted",
};
/** No audit metadata, IPs, tokens or financial descriptions are exposed in inbox copy. */
export const eventLabel = (action: string) => EVENT_LABELS[action] ?? "Account activity recorded";

const VENTURE_LABELS: Record<string, string> = {
  "venture.created": "Venture created",
  "venture.activated": "Workspace activated",
  "venture.invitation.created": "Team invitation sent",
  "venture.invitation.accepted": "Team invitation accepted",
  "venture.invitation.revoked": "Team invitation revoked",
  "venture.membership.created": "Team member added",
  "venture.membership.role_changed": "Team role changed",
  "venture.membership.deactivated": "Team member suspended",
  "venture.membership.activated": "Team member reactivated",
  "venture.membership.removed": "Team member removed",
  "venture.access_request.created": "Access requested",
  "venture.access_request.approved": "Access request approved",
  "venture.access_request.rejected": "Access request declined",
};
export const ventureEventLabel = (action: string) =>
  VENTURE_LABELS[action] ?? "Venture activity recorded";
