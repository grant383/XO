import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";
import { ventures } from "./tenancy";
import { id, timestamps } from "./types";
export const billingAccounts = pgTable(
  "billing_accounts",
  {
    id: id(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    checkoutSessionId: text("checkout_session_id"),
    checkoutExpiresAt: timestamp("checkout_expires_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("billing_accounts_creator_uq").on(t.createdBy),
    uniqueIndex("billing_accounts_customer_uq").on(t.stripeCustomerId),
  ],
);
export const billingAccountMembers = pgTable(
  "billing_account_members",
  {
    id: id(),
    billingAccountId: uuid("billing_account_id")
      .notNull()
      .references(() => billingAccounts.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull().default("owner"),
    active: boolean("active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("billing_account_members_account_user_uq").on(t.billingAccountId, t.userId),
    check("billing_account_members_role_ck", sql`${t.role} = 'owner'`),
    index("billing_account_members_user_idx").on(t.userId),
  ],
);
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    billingAccountId: uuid("billing_account_id")
      .notNull()
      .references(() => billingAccounts.id),
    stripeSubscriptionId: text("stripe_subscription_id").notNull(),
    status: text("status").notNull(),
    priceId: text("price_id").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    interval: text("interval").notNull(),
    intervalCount: integer("interval_count").notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("subscriptions_account_uq").on(t.billingAccountId),
    uniqueIndex("subscriptions_provider_uq").on(t.stripeSubscriptionId),
    check("subscriptions_money_ck", sql`${t.amountMinor} >= 0 and ${t.currency} ~ '^[A-Z]{3}$'`),
    check(
      "subscriptions_interval_ck",
      sql`${t.interval} in ('day', 'week', 'month', 'year') and ${t.intervalCount} > 0`,
    ),
    check(
      "subscriptions_status_ck",
      sql`${t.status} in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')`,
    ),
  ],
);
export const ventureEntitlements = pgTable(
  "venture_entitlements",
  {
    id: id(),
    ventureId: uuid("venture_id")
      .notNull()
      .references(() => ventures.id),
    billingAccountId: uuid("billing_account_id")
      .notNull()
      .references(() => billingAccounts.id),
    enabled: boolean("enabled").notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("venture_entitlements_venture_uq").on(t.ventureId),
    index("venture_entitlements_account_idx").on(t.billingAccountId),
  ],
);
export const billingWebhookEvents = pgTable(
  "billing_webhook_events",
  {
    id: id(),
    billingAccountId: uuid("billing_account_id")
      .notNull()
      .references(() => billingAccounts.id),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("billing_webhook_events_provider_uq").on(t.providerEventId)],
);
