import { sql } from "drizzle-orm";
import {
  char,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";
import { id, timestamps } from "./types";

/**
 * Venture lifecycle (ADR-0012). `draft` → `active` only through onboarding completion;
 * transitions are enforced by a database trigger and performed by SECURITY DEFINER
 * functions (the runtime role cannot write `status`).
 */
export const ventureStatus = pgEnum("venture_status", ["draft", "active", "suspended", "archived"]);

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
export const ventures = pgTable(
  "ventures",
  {
    id: id(),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    /** UK Companies House number, normalised (8 digits or 2-letter prefix + 6 digits). */
    companyNumber: text("company_number"),
    countryCode: char("country_code", { length: 2 }).notNull().default("GB"),
    reportingCurrency: char("reporting_currency", { length: 3 }).notNull().default("GBP"),
    timezone: text("timezone").notNull().default("Europe/London"),
    /** Sector code from the DirectorXO sector list (validated in the ventures module). */
    sector: text("sector"),
    /** Month (1–12) on whose first day the financial year starts. */
    fiscalYearStartMonth: smallint("fiscal_year_start_month"),
    status: ventureStatus("status").notNull().default("draft"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    /** Client idempotency key: a retried creation request returns the same venture. */
    creationRequestId: uuid("creation_request_id"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("ventures_creation_request_uq")
      .on(t.createdBy, t.creationRequestId)
      .where(sql`${t.creationRequestId} is not null`),
    check("ventures_name_ck", sql`length(btrim(${t.name})) between 1 and 200`),
    check("ventures_reporting_currency_ck", sql`${t.reportingCurrency} ~ '^[A-Z]{3}$'`),
    check(
      "ventures_company_number_ck",
      sql`${t.companyNumber} is null or ${t.companyNumber} ~ '^([0-9]{8}|[A-Z]{2}[0-9]{6})$'`,
    ),
    check("ventures_sector_ck", sql`${t.sector} is null or ${t.sector} ~ '^[a-z][a-z_]{1,39}$'`),
    check(
      "ventures_fiscal_year_start_month_ck",
      sql`${t.fiscalYearStartMonth} is null or ${t.fiscalYearStartMonth} between 1 and 12`,
    ),
  ],
);

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
