import { sql } from "drizzle-orm";
import {
  char,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";
import { id, timestamps } from "./types";

export const ventureStatus = pgEnum("venture_status", ["draft", "active", "archived"]);

/** Venture roles (spec §7). Ordered from most to least privileged. */
export const ventureRole = pgEnum("venture_role", [
  "owner",
  "admin",
  "manager",
  "operator",
  "viewer",
]);

export const membershipStatus = pgEnum("membership_status", ["active", "suspended", "removed"]);

/**
 * The tenant. Rows are created only through `app.create_venture()` so that the
 * venture and its Owner membership are inserted atomically under RLS.
 */
export const ventures = pgTable("ventures", {
  id: id(),
  name: text("name").notNull(),
  legalName: text("legal_name"),
  companyNumber: text("company_number"),
  countryCode: char("country_code", { length: 2 }).notNull().default("GB"),
  reportingCurrency: char("reporting_currency", { length: 3 }).notNull().default("GBP"),
  timezone: text("timezone").notNull().default("Europe/London"),
  status: ventureStatus("status").notNull().default("draft"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  ...timestamps(),
});

export const ventureMemberships = pgTable(
  "venture_memberships",
  {
    id: id(),
    ventureId: uuid("venture_id")
      .notNull()
      .references(() => ventures.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: ventureRole("role").notNull(),
    status: membershipStatus("status").notNull().default("active"),
    /** Bumped on every role/status change; invalidates cached authorization (spec §15). */
    version: integer("version").notNull().default(1),
    invitedBy: uuid("invited_by").references(() => users.id),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("venture_memberships_venture_user_uq").on(t.ventureId, t.userId),
    uniqueIndex("venture_memberships_one_active_owner_uq")
      .on(t.ventureId)
      .where(sql`${t.role} = 'owner' and ${t.status} = 'active'`),
    index("venture_memberships_user_idx").on(t.userId),
  ],
);
