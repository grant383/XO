CREATE TABLE "support_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_requests_subject_ck" CHECK (length(btrim("support_requests"."subject")) between 1 and 200),
	CONSTRAINT "support_requests_description_ck" CHECK (length(btrim("support_requests"."description")) between 10 and 5000),
	CONSTRAINT "support_requests_status_ck" CHECK ("support_requests"."status" in ('open', 'waiting', 'resolved', 'closed'))
);
--> statement-breakpoint
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "support_requests_user_request_uq" ON "support_requests" USING btree ("user_id","request_id");--> statement-breakpoint
CREATE INDEX "support_requests_user_time_idx" ON "support_requests" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE support_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_requests FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON support_requests TO dxo_app;
CREATE POLICY support_requests_self_select ON support_requests FOR SELECT TO dxo_app
  USING (user_id = (SELECT app.current_user_id()));
CREATE POLICY support_requests_self_insert ON support_requests FOR INSERT TO dxo_app
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND status = 'open');
-- No runtime UPDATE/DELETE: support state changes require a future audited support service.
