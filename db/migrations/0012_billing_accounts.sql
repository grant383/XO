CREATE TABLE "billing_account_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"billing_account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'owner' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_account_members_role_ck" CHECK ("billing_account_members"."role" = 'owner')
);
--> statement-breakpoint
CREATE TABLE "billing_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" uuid NOT NULL,
	"name" text NOT NULL,
	"stripe_customer_id" text,
	"checkout_session_id" text,
	"checkout_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"billing_account_id" uuid NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"billing_account_id" uuid NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"status" text NOT NULL,
	"price_id" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" char(3) NOT NULL,
	"interval" text NOT NULL,
	"interval_count" integer NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_money_ck" CHECK ("subscriptions"."amount_minor" >= 0 and "subscriptions"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "subscriptions_interval_ck" CHECK ("subscriptions"."interval" in ('day', 'week', 'month', 'year') and "subscriptions"."interval_count" > 0),
	CONSTRAINT "subscriptions_status_ck" CHECK ("subscriptions"."status" in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'))
);
--> statement-breakpoint
CREATE TABLE "venture_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venture_id" uuid NOT NULL,
	"billing_account_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_account_members" ADD CONSTRAINT "billing_account_members_billing_account_id_billing_accounts_id_fk" FOREIGN KEY ("billing_account_id") REFERENCES "public"."billing_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_account_members" ADD CONSTRAINT "billing_account_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_webhook_events" ADD CONSTRAINT "billing_webhook_events_billing_account_id_billing_accounts_id_fk" FOREIGN KEY ("billing_account_id") REFERENCES "public"."billing_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_billing_account_id_billing_accounts_id_fk" FOREIGN KEY ("billing_account_id") REFERENCES "public"."billing_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venture_entitlements" ADD CONSTRAINT "venture_entitlements_venture_id_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venture_entitlements" ADD CONSTRAINT "venture_entitlements_billing_account_id_billing_accounts_id_fk" FOREIGN KEY ("billing_account_id") REFERENCES "public"."billing_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_account_members_account_user_uq" ON "billing_account_members" USING btree ("billing_account_id","user_id");--> statement-breakpoint
CREATE INDEX "billing_account_members_user_idx" ON "billing_account_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_accounts_creator_uq" ON "billing_accounts" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_accounts_customer_uq" ON "billing_accounts" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_webhook_events_provider_uq" ON "billing_webhook_events" USING btree ("provider_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_account_uq" ON "subscriptions" USING btree ("billing_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_provider_uq" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "venture_entitlements_venture_uq" ON "venture_entitlements" USING btree ("venture_id");--> statement-breakpoint
CREATE INDEX "venture_entitlements_account_idx" ON "venture_entitlements" USING btree ("billing_account_id");--> statement-breakpoint
CREATE FUNCTION app.current_billing_account_id() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.billing_account_id', true), '')::uuid $$;
REVOKE ALL ON FUNCTION app.current_billing_account_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_billing_account_id() TO dxo_app, dxo_definer;

CREATE FUNCTION app.owns_billing_account(p_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.billing_account_members m
    WHERE m.billing_account_id = p_id AND m.user_id = app.current_user_id() AND m.role = 'owner' AND m.active)
  $$;
GRANT SELECT ON billing_account_members TO dxo_definer;
ALTER FUNCTION app.owns_billing_account(uuid) OWNER TO dxo_definer;
REVOKE ALL ON FUNCTION app.owns_billing_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.owns_billing_account(uuid) TO dxo_app, dxo_definer;

CREATE FUNCTION app.billing_service_scope(p_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app.current_service_id() IN ('billing:stripe', 'webhook:stripe') AND p_id = app.current_billing_account_id()
$$;
REVOKE ALL ON FUNCTION app.billing_service_scope(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_service_scope(uuid) TO dxo_app, dxo_definer;

ALTER TABLE billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_accounts FORCE ROW LEVEL SECURITY;
GRANT SELECT ON billing_accounts TO dxo_app;
GRANT UPDATE (stripe_customer_id, checkout_session_id, checkout_expires_at, updated_at) ON billing_accounts TO dxo_app;
CREATE POLICY billing_accounts_read ON billing_accounts FOR SELECT TO dxo_app USING (app.owns_billing_account(id) OR app.billing_service_scope(id));
CREATE POLICY billing_accounts_service_update ON billing_accounts FOR UPDATE TO dxo_app USING (app.billing_service_scope(id)) WITH CHECK (app.billing_service_scope(id));

ALTER TABLE billing_account_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_account_members FORCE ROW LEVEL SECURITY;
GRANT SELECT ON billing_account_members TO dxo_app;
CREATE POLICY billing_members_read ON billing_account_members FOR SELECT TO dxo_app USING ((user_id = app.current_user_id() AND role = 'owner' AND active) OR app.billing_service_scope(billing_account_id));

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON subscriptions TO dxo_app;
CREATE POLICY subscriptions_read ON subscriptions FOR SELECT TO dxo_app USING (app.owns_billing_account(billing_account_id) OR app.billing_service_scope(billing_account_id));
CREATE POLICY subscriptions_insert ON subscriptions FOR INSERT TO dxo_app WITH CHECK (app.current_service_id() = 'webhook:stripe' AND app.billing_service_scope(billing_account_id));
CREATE POLICY subscriptions_update ON subscriptions FOR UPDATE TO dxo_app USING (app.current_service_id() = 'webhook:stripe' AND app.billing_service_scope(billing_account_id)) WITH CHECK (app.current_service_id() = 'webhook:stripe' AND app.billing_service_scope(billing_account_id));

ALTER TABLE venture_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE venture_entitlements FORCE ROW LEVEL SECURITY;
GRANT SELECT ON venture_entitlements TO dxo_app;
GRANT UPDATE (enabled, updated_at) ON venture_entitlements TO dxo_app;
CREATE POLICY entitlements_read ON venture_entitlements FOR SELECT TO dxo_app USING ((app.owns_billing_account(billing_account_id) AND app.has_venture_access(venture_id)) OR app.billing_service_scope(billing_account_id));
CREATE POLICY entitlements_update ON venture_entitlements FOR UPDATE TO dxo_app USING (app.current_service_id() = 'webhook:stripe' AND app.billing_service_scope(billing_account_id)) WITH CHECK (app.current_service_id() = 'webhook:stripe' AND app.billing_service_scope(billing_account_id));

ALTER TABLE billing_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_webhook_events FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON billing_webhook_events TO dxo_app;
CREATE POLICY billing_events_read ON billing_webhook_events FOR SELECT TO dxo_app USING (app.current_service_id() = 'webhook:stripe' AND app.billing_service_scope(billing_account_id));
CREATE POLICY billing_events_insert ON billing_webhook_events FOR INSERT TO dxo_app WITH CHECK (app.current_service_id() = 'webhook:stripe' AND app.billing_service_scope(billing_account_id));

GRANT SELECT, INSERT ON billing_accounts TO dxo_definer;
GRANT INSERT ON billing_account_members, venture_entitlements TO dxo_definer;
GRANT SELECT (venture_id, billing_account_id) ON venture_entitlements TO dxo_definer;
GRANT SELECT (id, created_by) ON ventures TO dxo_definer;
GRANT SELECT ON subscriptions TO dxo_definer;
CREATE FUNCTION app.provision_venture_billing(p_venture_id uuid, p_owner_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  DECLARE v_account uuid;
  BEGIN
    INSERT INTO public.billing_accounts (created_by, name) VALUES (p_owner_id, 'DirectorXO account')
      ON CONFLICT (created_by) DO NOTHING;
    SELECT id INTO v_account FROM public.billing_accounts WHERE created_by = p_owner_id;
    INSERT INTO public.billing_account_members (billing_account_id, user_id, role)
      VALUES (v_account, p_owner_id, 'owner') ON CONFLICT (billing_account_id, user_id) DO NOTHING;
    INSERT INTO public.venture_entitlements (venture_id, billing_account_id, enabled)
      VALUES (p_venture_id, v_account, EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.billing_account_id = v_account AND s.status IN ('active','trialing')))
      ON CONFLICT (venture_id) DO NOTHING;
  END $$;
ALTER FUNCTION app.provision_venture_billing(uuid, uuid) OWNER TO dxo_definer;
REVOKE ALL ON FUNCTION app.provision_venture_billing(uuid, uuid) FROM PUBLIC;

CREATE FUNCTION app.on_venture_billing() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN PERFORM app.provision_venture_billing(NEW.id, NEW.created_by); RETURN NEW; END $$;
ALTER FUNCTION app.on_venture_billing() OWNER TO dxo_definer;
REVOKE ALL ON FUNCTION app.on_venture_billing() FROM PUBLIC;
CREATE TRIGGER ventures_billing AFTER INSERT ON ventures FOR EACH ROW EXECUTE FUNCTION app.on_venture_billing();

-- Recover existing ventures once, without broadening runtime grants.
CREATE FUNCTION app.backfill_billing_accounts() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE v record;
BEGIN FOR v IN SELECT id, created_by FROM public.ventures LOOP PERFORM app.provision_venture_billing(v.id, v.created_by); END LOOP; END $$;
ALTER FUNCTION app.backfill_billing_accounts() OWNER TO dxo_definer;
REVOKE ALL ON FUNCTION app.backfill_billing_accounts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.backfill_billing_accounts() TO dxo_migrator;
SELECT app.backfill_billing_accounts();
DROP FUNCTION app.backfill_billing_accounts();

GRANT SELECT (venture_id, billing_account_id) ON venture_entitlements TO dxo_definer;
-- Conflict arbiter checks in provisioning require these read privileges.
GRANT SELECT ON billing_account_members TO dxo_definer;
CREATE FUNCTION app.billing_account_for_customer(p_customer text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT id FROM public.billing_accounts WHERE stripe_customer_id = p_customer AND app.current_service_id() = 'webhook:stripe'
$$;
ALTER FUNCTION app.billing_account_for_customer(text) OWNER TO dxo_definer;
REVOKE ALL ON FUNCTION app.billing_account_for_customer(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_account_for_customer(text) TO dxo_app;

GRANT UPDATE (active) ON billing_account_members TO dxo_definer;
CREATE FUNCTION app.lock_billing_owner(p_account uuid, p_user uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF app.current_service_id() <> 'billing:stripe' OR p_account IS DISTINCT FROM app.current_billing_account_id() THEN RETURN false; END IF;
  PERFORM 1 FROM public.billing_account_members WHERE billing_account_id = p_account AND user_id = p_user AND active AND role = 'owner' FOR SHARE;
  RETURN FOUND;
END $$;
ALTER FUNCTION app.lock_billing_owner(uuid, uuid) OWNER TO dxo_definer;
REVOKE ALL ON FUNCTION app.lock_billing_owner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lock_billing_owner(uuid, uuid) TO dxo_app;
