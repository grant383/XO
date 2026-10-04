/**
 * Memberships module (spec §14 "Memberships" API group): team management, invitations,
 * invitation acceptance and access requests (ADR-0013). Permission decisions use the
 * canonical RBAC policy in `@/modules/ventures`; PostgreSQL RLS (migration 0007)
 * independently enforces tenancy and team-management role rules.
 */
export {
  changeMemberRole,
  changeMemberStatus,
  getTeam,
  type MemberStatusChange,
  type MembershipStatus,
  type PendingAccessRequest,
  type PendingInvitation,
  type TeamMember,
  type TeamView,
} from "./team";
export {
  ACCEPT_MESSAGES,
  acceptInvitation,
  createInvitation,
  previewInvitation,
  revokeInvitation,
  type AcceptFailure,
  type InvitationPreview,
} from "./invitations";
export { approveAccessRequest, rejectAccessRequest, requestAccess } from "./access-requests";
export { assertMembershipForJob, MembershipRevokedError } from "./jobs";
export { TeamEvents, type TeamErrorCode, type TeamResult } from "./shared";
export { ACCESS_REQUEST_POLICY, INVITATION_POLICY, type InvitationInput } from "./policy";
export { invitationPath, isWellFormedInvitationToken, hashInvitationToken } from "./tokens";
