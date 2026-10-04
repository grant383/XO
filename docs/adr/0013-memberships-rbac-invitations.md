# ADR-0013 — Memberships, RBAC, invitations and access requests

- Status: Accepted (P0 step 5)
- Date: 2026-10-04

## Context
Spec §7 defines five venture roles; §8 places Team and Permissions at `/v/[ventureId]/settings/team` (Admin+); §12 lists "Accept team invitation" and "Permission-denied request-access flow" as P0 screens without routes; §15 requires server-side RBAC, independent RLS, and that permission changes invalidate cached authorisation; §19 P0 exit criteria require inviting a member and assigning a role. ADR-0007 already reserves Owner rows from table writes and lets Admins manage Manager/Operator/Viewer only.

`DIRECTORXO_IMPLEMENTATION_MATRIX.md` is referenced as a source of truth but is not present in the repository; this ADR records the decisions taken from the product specification alone.

## Decision

### Roles and capabilities
- Roles are exactly the spec's: Owner, Admin, Manager, Operator, Viewer. There is no "Member" role.
- `src/modules/ventures/rbac.ts` is the only permission mechanism. Capabilities are derived from the role (no per-user overrides in P0):

| Capability | Roles |
|---|---|
| `venture:view` | Viewer+ |
| `venture:update`, `settings:view`, `settings:update`, `audit:view` | Admin+ |
| `team:view`, `team:invite` (also approve/reject access requests), `team:update_role`, `team:remove` (suspend, reactivate, remove) | Admin+ |
| `venture:onboard` | Owner |

- Target rule (`canManageRole` / `canChangeMember`, mirrored by `app.can_manage_role`): Owner manages every non-owner role; Admin manages Manager/Operator/Viewer; nobody acts on their own membership; nobody assigns Owner.
- `resolveVenture(actor, id, { capability })` replaces role lists. Membership and role are read from PostgreSQL on every request and again inside every mutation transaction; nothing is cached, so role changes, suspension and removal apply to the member's next request. RLS re-evaluates the role on every statement.

### Membership states
`venture_memberships.status` keeps the existing `active | suspended | removed`. Suspended = deactivated (reversible); removed = left the venture (row kept for history, `removed_at` maintained by trigger). "Invited" is the `venture_invitations` row, not a membership state. A removed member can rejoin through an invitation or an approved access request (same row, reactivated).

### Owner invariant
A trigger on `venture_memberships` applies to every role, including definers and the schema owner: the Owner row cannot be demoted, suspended or removed, Owner cannot be assigned by update, and an Owner row can be inserted only as the venture's first membership (`app.create_venture`). Ownership transfer (spec §7) is not in the P0 backlog and is not implemented; it will need a dedicated audited definer function and a change to this trigger. Test fixtures that must simulate an impossible Owner state skip triggers for their own superuser transaction (`forceOwnerMembershipStatus`).

### Invitations (`venture_invitations`)
- Token: 256 random bits, base64url. Only `token_hash` (SHA-256, base64url) is stored; the raw token appears only in the email and the invitee's URL. Audit metadata contains neither tokens nor email addresses.
- 7-day expiry, single use, one pending invitation per (venture, email), at most 50 pending per venture; lapsed invitations are marked `expired` when the next invitation is created. Terms (`venture_id`, `email`, `role`, `token_hash`, `invited_by`, `expires_at`) are immutable and terminal states are final (trigger).
- Created and revoked by Owner/Admin under RLS. Email is sent after commit; a delivery failure is reported to the inviter and leaves a revocable invitation.
- Acceptance only through `app.accept_venture_invitation(token_hash)` (SECURITY DEFINER), which locks the invitation and, in one transaction, re-checks: pending, not expired, signed-in user's **verified** email equals the invited address (case-insensitive), venture still active, inviter still an active member allowed to grant that role, and the user is not already an active or suspended member. It then creates (or reactivates) the membership, marks the invitation accepted and writes audit records. Any failure leaves no membership; failures are recorded as account-level `venture.invitation.accept_failed` events.
- `app.preview_venture_invitation` discloses venture name, role and inviter only to the invited account.
- Route: `/invite/[token]` (not defined by the spec; chosen for the P0 "Accept team invitation" screen). Acceptance is an explicit POST so mail scanners cannot consume the token. The page sends `Referrer-Policy: no-referrer`.
- New users: sign-in and registration carry a validated `next` path (`safeNextPath`: same-origin path of unreserved characters only). Registration passes it as Better Auth `callbackURL`; the verification email links to `/auth/verify-email?…&next=/invite/…`, whose success link signs in back to the invitation. Email verification remains mandatory; unverified identities cannot accept. The invitation itself persists server-side until expiry, so the original email link also keeps working.

### Access requests (`venture_access_requests`)
- Route: `/v/[ventureId]/request-access` (follows the `/v/[ventureId]/*` convention; not defined by the spec). Venture pages show non-members and unknown ventures the same "no access — request access" state.
- Created only by `app.request_venture_access(venture_id)` (SECURITY DEFINER). The outcome is identical for unknown, non-active, already-joined, suspended, duplicate and over-limit (10 pending per requester) cases, and the requester cannot read requests, so the flow cannot discover ventures or their state. The requester's name and email are snapshotted so reviewers can identify a non-member without widening `users` visibility.
- Owner/Admin review under RLS. Approval is one transaction: re-read reviewer role, check the request is still pending, create or reactivate the membership with the reviewer-chosen role (Admin cannot grant Admin), mark approved with reviewer, audit. Rejection records the reviewer and is audited. The requester is not notified (deferred to notifications, step 8).

### RLS design (migration 0007)
| Table | dxo_app SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `venture_invitations` | Owner/Admin of active venture context | Owner/Admin, manageable role, `invited_by = self`, pending, expiry ≤ 30 days, venture active | `status, revoked_at, revoked_by` only; pending → revoked (as self) or expired (when lapsed); manageable role | none |
| `venture_access_requests` | Owner/Admin of active venture context | none (definer only) | `status, granted_role, reviewed_by, reviewed_at`; pending → approved (manageable role) / rejected; `reviewed_by = self` | none |
| `venture_memberships` | unchanged (0001) | unchanged | unchanged + Owner-invariant trigger | none |

All tables use ENABLE + FORCE RLS; the catalogue tests cover them. Definer functions are owned by `dxo_definer`, pin `search_path`, compare emails with explicit `lower()` (citext operators are not on the pinned path) and are executable by `dxo_app` only.

### Audit events
`venture.invitation.created | revoked | expired | accepted | accept_failed`, `venture.access_request.created | approved | rejected`, `venture.membership.created | reactivated | role_changed | deactivated | activated | removed`. All carry actor, subject user, target and correlation id.

### Background jobs
Jobs run as a service identity scoped to one venture. A job acting for a user must call `assertMembershipForJob` when it executes (not when enqueued), so membership or role changes in between are honoured.

## Alternatives considered
- Better Auth organizations plugin: rejected in ADR-0009 (tenancy is DirectorXO domain).
- An `invited` membership status: rejected; invitations need email-addressed, token-bound, expiring records before a user exists.
- Accepting invitations by verified-email match without a token: rejected; the token proves possession of the invitation link.
- Showing requesters their request status: rejected; it would reveal whether a venture id exists.

## Consequences
- Team management requires an active venture (drafts are Owner-only onboarding).
- REST endpoints under `/api/v1/memberships` are not added in P0 step 5; server actions call the same module services (ADR-0006).
- Requesters and invitees receive no notification of decisions until the notification foundation (step 8).
