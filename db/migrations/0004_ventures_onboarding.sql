CREATE TYPE "public"."company_verification_status" AS ENUM('not_provided', 'verified', 'not_found', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."onboarding_step" AS ENUM('business', 'data_connections', 'review', 'completed');--> statement-breakpoint
ALTER TYPE "public"."venture_status" ADD VALUE 'suspended' BEFORE 'archived';--> statement-breakpoint
CREATE TABLE "venture_onboarding" (
	"venture_id" uuid PRIMARY KEY NOT NULL,
	"current_step" "onboarding_step" DEFAULT 'business' NOT NULL,
	"business_completed_at" timestamp with time zone,
	"data_connections_completed_at" timestamp with time zone,
	"review_completed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"company_verification_status" "company_verification_status" DEFAULT 'not_provided' NOT NULL,
	"company_verification" jsonb,
	"company_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "venture_onboarding_step_order_ck" CHECK (("venture_onboarding"."data_connections_completed_at" is null or "venture_onboarding"."business_completed_at" is not null)
          and ("venture_onboarding"."review_completed_at" is null or "venture_onboarding"."data_connections_completed_at" is not null)
          and ("venture_onboarding"."completed_at" is null or "venture_onboarding"."review_completed_at" is not null)),
	CONSTRAINT "venture_onboarding_completed_ck" CHECK (("venture_onboarding"."completed_at" is not null) = ("venture_onboarding"."current_step" = 'completed'))
);
--> statement-breakpoint
ALTER TABLE "ventures" ADD COLUMN "sector" text;--> statement-breakpoint
ALTER TABLE "ventures" ADD COLUMN "fiscal_year_start_month" smallint;--> statement-breakpoint
ALTER TABLE "ventures" ADD COLUMN "creation_request_id" uuid;--> statement-breakpoint
ALTER TABLE "venture_onboarding" ADD CONSTRAINT "venture_onboarding_venture_id_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venture_onboarding" ADD CONSTRAINT "venture_onboarding_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ventures_creation_request_uq" ON "ventures" USING btree ("created_by","creation_request_id") WHERE "ventures"."creation_request_id" is not null;--> statement-breakpoint
ALTER TABLE "ventures" ADD CONSTRAINT "ventures_name_ck" CHECK (length(btrim("ventures"."name")) between 1 and 200);--> statement-breakpoint
ALTER TABLE "ventures" ADD CONSTRAINT "ventures_reporting_currency_ck" CHECK ("ventures"."reporting_currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "ventures" ADD CONSTRAINT "ventures_company_number_ck" CHECK ("ventures"."company_number" is null or "ventures"."company_number" ~ '^([0-9]{8}|[A-Z]{2}[0-9]{6})$');--> statement-breakpoint
ALTER TABLE "ventures" ADD CONSTRAINT "ventures_sector_ck" CHECK ("ventures"."sector" is null or "ventures"."sector" ~ '^[a-z][a-z_]{1,39}$');--> statement-breakpoint
ALTER TABLE "ventures" ADD CONSTRAINT "ventures_fiscal_year_start_month_ck" CHECK ("ventures"."fiscal_year_start_month" is null or "ventures"."fiscal_year_start_month" between 1 and 12);