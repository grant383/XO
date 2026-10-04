import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { citext, id, timestamps } from "./types";

/**
 * Identity store. Written by Better Auth through the `dxo_auth` role only.
 * The runtime `dxo_app` role has column-restricted, RLS-filtered read access
 * (self and co-members of shared ventures).
 */
export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: citext("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  ...timestamps(),
});

/**
 * Database-backed browser sessions (ADR-0009). The opaque `token` is referenced by a
 * signed HttpOnly cookie; deleting the row revokes the session immediately.
 * `dxo_app` has no access to this table.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...timestamps(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/**
 * Credentials and (future) external identity links. For the `credential` provider,
 * `password` holds a scrypt hash; plaintext passwords are never stored.
 */
export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("accounts_provider_account_uq").on(t.providerId, t.accountId),
    index("accounts_user_idx").on(t.userId),
  ],
);

/**
 * Short-lived single-use verification values (e.g. password-reset tokens).
 * Identifiers are stored hashed, so a database read does not reveal usable tokens.
 */
export const verifications = pgTable(
  "verifications",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

/**
 * Records consumed stateless tokens (email-verification JWTs) so each can be used
 * once. Only a SHA-256 hash is stored. Rows may be purged after `expires_at`.
 */
export const authConsumedTokens = pgTable(
  "auth_consumed_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    purpose: text("purpose").notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("auth_consumed_tokens_expires_idx").on(t.expiresAt)],
);
