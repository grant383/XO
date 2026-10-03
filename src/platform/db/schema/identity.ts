import { boolean, pgTable, text } from "drizzle-orm/pg-core";
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
