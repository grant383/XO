CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"audit_event_id" uuid NOT NULL,
	"action" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_audit_event_id_audit_log_id_fk" FOREIGN KEY ("audit_event_id") REFERENCES "public"."audit_log"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_event_user_uq" ON "notifications" USING btree ("audit_event_id","user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_time_idx" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
GRANT SELECT ON notifications TO dxo_app;
GRANT UPDATE (read_at) ON notifications TO dxo_app;
CREATE POLICY notifications_self_select ON notifications FOR SELECT TO dxo_app
  USING (user_id = (SELECT app.current_user_id()));
CREATE POLICY notifications_self_update ON notifications FOR UPDATE TO dxo_app
  USING (user_id = (SELECT app.current_user_id()))
  WITH CHECK (user_id = (SELECT app.current_user_id()));
GRANT INSERT ON notifications TO dxo_definer;

-- No raw audit metadata or venture data is copied into the account inbox.
CREATE FUNCTION app.project_account_notification() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  BEGIN
    IF NEW.venture_id IS NULL THEN
      INSERT INTO public.notifications (user_id, audit_event_id, action, created_at)
      SELECT u.id, NEW.id, NEW.action, NEW.occurred_at
      FROM public.users u WHERE u.id = coalesce(NEW.subject_user_id, NEW.actor_user_id)
      ON CONFLICT (audit_event_id, user_id) DO NOTHING;
    END IF;
    RETURN NEW;
  END $$;
ALTER FUNCTION app.project_account_notification() OWNER TO dxo_definer;
REVOKE ALL ON FUNCTION app.project_account_notification() FROM PUBLIC;
CREATE TRIGGER audit_log_account_notification AFTER INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION app.project_account_notification();
-- ON CONFLICT's arbiter columns require SELECT in addition to INSERT.
GRANT SELECT (audit_event_id, user_id) ON notifications TO dxo_definer;
