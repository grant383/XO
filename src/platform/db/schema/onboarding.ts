import { sql } from "drizzle-orm";
import { check, jsonb, pgEnum, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";
import { ventures } from "./tenancy";
import { timestamps } from "./types";

export const onboardingStep = pgEnum("onboarding_step", [
  "business",
  "data_connections",
  "review",
  "completed",
]);

export const companyVerificationStatus = pgEnum("company_verification_status", [
  "not_provided",
  "verified",
  "not_found",
  "unavailable",
]);

/**
 * Server-authoritative onboarding progress (one row per venture). Created atomically
 * with the venture by `app.create_venture()`; completed only by
 * `app.complete_venture_onboarding()`, which also activates the venture.
 */
export const ventureOnboarding = pgTable(
  "venture_onboarding",
  {
    ventureId: uuid("venture_id")
      .primaryKey()
      .references(() => ventures.id),
    currentStep: onboardingStep("current_step").notNull().default("business"),
    businessCompletedAt: timestamp("business_completed_at", { withTimezone: true }),
    dataConnectionsCompletedAt: timestamp("data_connections_completed_at", { withTimezone: true }),
    reviewCompletedAt: timestamp("review_completed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    companyVerificationStatus: companyVerificationStatus("company_verification_status")
      .notNull()
      .default("not_provided"),
    /** Provider snapshot with source metadata (provider, fetched_at, company status...). */
    companyVerification: jsonb("company_verification"),
    companyVerifiedAt: timestamp("company_verified_at", { withTimezone: true }),
    ...timestamps(),
    updatedBy: uuid("updated_by")
      .notNull()
      .references(() => users.id),
  },
  (t) => [
    check(
      "venture_onboarding_step_order_ck",
      sql`(${t.dataConnectionsCompletedAt} is null or ${t.businessCompletedAt} is not null)
          and (${t.reviewCompletedAt} is null or ${t.dataConnectionsCompletedAt} is not null)
          and (${t.completedAt} is null or ${t.reviewCompletedAt} is not null)`,
    ),
    check(
      "venture_onboarding_completed_ck",
      sql`(${t.completedAt} is not null) = (${t.currentStep} = 'completed')`,
    ),
  ],
);
