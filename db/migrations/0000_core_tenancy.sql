-- Case-insensitive email addresses.
CREATE EXTENSION IF NOT EXISTS citext;--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('active', 'suspended', 'removed');--> statement-breakpoint
CREATE TYPE "public"."venture_role" AS ENUM('owner', 'admin', 'manager', 'operator', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."venture_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."audit_actor_type" AS ENUM('user', 'service', 'system', 'anonymous');--> statement-breakpoint
CREATE TYPE "public"."audit_outcome" AS ENUM('success', 'failure', 'denied');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" "citext" NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "venture_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venture_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "venture_role" NOT NULL,
	"status" "membership_status" DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"invited_by" uuid,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ventures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"company_number" text,
	"country_code" char(2) DEFAULT 'GB' NOT NULL,
	"reporting_currency" char(3) DEFAULT 'GBP' NOT NULL,
	"timezone" text DEFAULT 'Europe/London' NOT NULL,
	"status" "venture_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venture_id" uuid,
	"actor_type" "audit_actor_type" NOT NULL,
	"actor_user_id" uuid,
	"actor_service" text,
	"subject_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"outcome" "audit_outcome" DEFAULT 'success' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"correlation_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_actor_identity_ck" CHECK (("audit_log"."actor_type" <> 'user' or "audit_log"."actor_user_id" is not null)
          and ("audit_log"."actor_type" <> 'service' or "audit_log"."actor_service" is not null)),
	CONSTRAINT "audit_log_account_event_subject_ck" CHECK ("audit_log"."venture_id" is not null or "audit_log"."subject_user_id" is not null
          or "audit_log"."actor_user_id" is not null or "audit_log"."actor_type" = 'anonymous')
);
--> statement-breakpoint
ALTER TABLE "venture_memberships" ADD CONSTRAINT "venture_memberships_venture_id_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venture_memberships" ADD CONSTRAINT "venture_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venture_memberships" ADD CONSTRAINT "venture_memberships_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventures" ADD CONSTRAINT "ventures_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "venture_memberships_venture_user_uq" ON "venture_memberships" USING btree ("venture_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "venture_memberships_one_active_owner_uq" ON "venture_memberships" USING btree ("venture_id") WHERE "venture_memberships"."role" = 'owner' and "venture_memberships"."status" = 'active';--> statement-breakpoint
CREATE INDEX "venture_memberships_user_idx" ON "venture_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_log_venture_time_idx" ON "audit_log" USING btree ("venture_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_subject_time_idx" ON "audit_log" USING btree ("subject_user_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_actor_time_idx" ON "audit_log" USING btree ("actor_user_id","occurred_at" DESC NULLS LAST);