import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";
import { ventureRole, ventures } from "./tenancy";
import { citext, id, timestamps } from "./types";

/**
 * Team invitations and access requests (ADR-0013). Memberships themselves live in
 * `venture_memberships` (tenancy.ts); these tables hold the pre-membership states.
 */
export const invitationStatus = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "revoked",
  "expired",
]);

export const accessRequestStatus = pgEnum("access_request_status", [
  "pending",
  "approved",
  "rejected",
]);

/**
 * An invitation to join a venture with a role. Only a SHA-256 digest of the single-use
 * token is stored; the raw token exists only in the invitation email. Accepted only via
 * `app.accept_venture_invitation()`, which creates the membership atomically.
 */
export const ventureInvitations = pgTable(
  "venture_invitations",
  {
    id: id(),
    ventureId: uuid("venture_id")
      .notNull()
      .references(() => ventures.id),
    email: citext("email").notNull(),
    role: ventureRole("role").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    status: invitationStatus("status").notNull().default("pending"),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: uuid("accepted_by").references(() => users.id),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => users.id),
    ...timestamps(),
  },
  (t) => [
    // At most one live invitation per address per venture.
    uniqueIndex("venture_invitations_pending_email_uq")
      .on(t.ventureId, t.email)
      .where(sql`${t.status} = 'pending'`),
    index("venture_invitations_venture_status_idx").on(t.ventureId, t.status),
    check("venture_invitations_role_ck", sql`${t.role} <> 'owner'`),
    check("venture_invitations_email_ck", sql`length(${t.email}) between 3 and 320`),
    check("venture_invitations_token_hash_ck", sql`${t.tokenHash} ~ '^[A-Za-z0-9_-]{43}$'`),
    check(
      "venture_invitations_state_ck",
      sql`(${t.status} = 'accepted') = (${t.acceptedAt} is not null and ${t.acceptedBy} is not null)
          and (${t.status} = 'revoked') = (${t.revokedAt} is not null and ${t.revokedBy} is not null)`,
    ),
  ],
);

/**
 * A signed-in user's request to join a venture. Created only via
 * `app.request_venture_access()`, which never reveals whether the venture exists.
 * The requester's name/email are snapshotted so reviewers can identify a non-member
 * without widening `users` visibility.
 */
export const ventureAccessRequests = pgTable(
  "venture_access_requests",
  {
    id: id(),
    ventureId: uuid("venture_id")
      .notNull()
      .references(() => ventures.id),
    requesterUserId: uuid("requester_user_id")
      .notNull()
      .references(() => users.id),
    requesterName: text("requester_name").notNull(),
    requesterEmail: citext("requester_email").notNull(),
    status: accessRequestStatus("status").notNull().default("pending"),
    grantedRole: ventureRole("granted_role"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("venture_access_requests_pending_uq")
      .on(t.ventureId, t.requesterUserId)
      .where(sql`${t.status} = 'pending'`),
    index("venture_access_requests_venture_status_idx").on(t.ventureId, t.status),
    index("venture_access_requests_requester_idx").on(t.requesterUserId),
    check(
      "venture_access_requests_state_ck",
      sql`(${t.status} = 'pending') = (${t.reviewedBy} is null and ${t.reviewedAt} is null)
          and (${t.status} = 'approved') = (${t.grantedRole} is not null)
          and (${t.grantedRole} is null or ${t.grantedRole} <> 'owner')`,
    ),
  ],
);
