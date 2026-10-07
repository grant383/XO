CREATE TYPE "public"."command_task_priority" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."command_task_status" AS ENUM('open', 'done');--> statement-breakpoint
CREATE TABLE "command_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venture_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"title" text NOT NULL,
	"priority" "command_task_priority" NOT NULL,
	"due_on" date,
	"status" "command_task_status" DEFAULT 'open' NOT NULL,
	"created_by" uuid NOT NULL,
	"status_changed_at" timestamp with time zone,
	"status_changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "command_tasks_title_ck" CHECK (length(btrim("command_tasks"."title")) between 1 and 200),
	CONSTRAINT "command_tasks_status_change_ck" CHECK (("command_tasks"."status_changed_at" is null) = ("command_tasks"."status_changed_by" is null))
);
--> statement-breakpoint
ALTER TABLE "command_tasks" ADD CONSTRAINT "command_tasks_venture_id_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "command_tasks" ADD CONSTRAINT "command_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "command_tasks" ADD CONSTRAINT "command_tasks_status_changed_by_users_id_fk" FOREIGN KEY ("status_changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "command_tasks_venture_request_uq" ON "command_tasks" USING btree ("venture_id","request_id");--> statement-breakpoint
CREATE INDEX "command_tasks_venture_status_idx" ON "command_tasks" USING btree ("venture_id","status","due_on");