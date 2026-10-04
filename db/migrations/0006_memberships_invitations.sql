CREATE TYPE "public"."access_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');--> statement-breakpoint
CREATE TABLE "venture_access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venture_id" uuid NOT NULL,
	"requester_user_id" uuid NOT NULL,
	"requester_name" text NOT NULL,
	"requester_email" "citext" NOT NULL,
	"status" "access_request_status" DEFAULT 'pending' NOT NULL,
	"granted_role" "venture_role",
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venture_access_requests_state_ck" CHECK (("venture_access_requests"."status" = 'pending') = ("venture_access_requests"."reviewed_by" is null and "venture_access_requests"."reviewed_at" is null)
          and ("venture_access_requests"."status" = 'approved') = ("venture_access_requests"."granted_role" is not null)
          and ("venture_access_requests"."granted_role" is null or "venture_access_requests"."granted_role" <> 'owner'))
);
--> statement-breakpoint
CREATE TABLE "venture_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venture_id" uuid NOT NULL,
	"email" "citext" NOT NULL,
	"role" "venture_role" NOT NULL,
	"token_hash" text NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venture_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "venture_invitations_role_ck" CHECK ("venture_invitations"."role" <> 'owner'),
	CONSTRAINT "venture_invitations_email_ck" CHECK (length("venture_invitations"."email") between 3 and 320),
	CONSTRAINT "venture_invitations_token_hash_ck" CHECK ("venture_invitations"."token_hash" ~ '^[A-Za-z0-9_-]{43}$'),
	CONSTRAINT "venture_invitations_state_ck" CHECK (("venture_invitations"."status" = 'accepted') = ("venture_invitations"."accepted_at" is not null and "venture_invitations"."accepted_by" is not null)
          and ("venture_invitations"."status" = 'revoked') = ("venture_invitations"."revoked_at" is not null and "venture_invitations"."revoked_by" is not null))
);
--> statement-breakpoint
ALTER TABLE "venture_access_requests" ADD CONSTRAINT "venture_access_requests_venture_id_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venture_access_requests" ADD CONSTRAINT "venture_access_requests_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venture_access_requests" ADD CONSTRAINT "venture_access_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venture_invitations" ADD CONSTRAINT "venture_invitations_venture_id_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venture_invitations" ADD CONSTRAINT "venture_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venture_invitations" ADD CONSTRAINT "venture_invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venture_invitations" ADD CONSTRAINT "venture_invitations_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "venture_access_requests_pending_uq" ON "venture_access_requests" USING btree ("venture_id","requester_user_id") WHERE "venture_access_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "venture_access_requests_venture_status_idx" ON "venture_access_requests" USING btree ("venture_id","status");--> statement-breakpoint
CREATE INDEX "venture_access_requests_requester_idx" ON "venture_access_requests" USING btree ("requester_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "venture_invitations_pending_email_uq" ON "venture_invitations" USING btree ("venture_id","email") WHERE "venture_invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "venture_invitations_venture_status_idx" ON "venture_invitations" USING btree ("venture_id","status");