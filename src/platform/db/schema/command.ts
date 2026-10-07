import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";
import { ventures } from "./tenancy";
import { id, timestamps } from "./types";

export const commandTaskPriority = pgEnum("command_task_priority", ["high", "medium", "low"]);
export const commandTaskStatus = pgEnum("command_task_status", ["open", "done"]);

/**
 * Command Centre "What to do" (Figma 8:651; Command/Build matrix 50:10242 "tasks").
 * Venture-owned: FORCE RLS lets every active member read and Operator+ write (migration
 * 0014). Rows are never deleted; status changes are audited by the command module.
 */
export const commandTasks = pgTable(
  "command_tasks",
  {
    id: id(),
    ventureId: uuid("venture_id")
      .notNull()
      .references(() => ventures.id),
    /** Client idempotency key: a retried creation returns the same task. */
    requestId: uuid("request_id").notNull(),
    title: text("title").notNull(),
    priority: commandTaskPriority("priority").notNull(),
    /** Calendar date in the venture's timezone; no time component. */
    dueOn: date("due_on"),
    status: commandTaskStatus("status").notNull().default("open"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    /** Most recent completion or reopening ("What changed"). */
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
    statusChangedBy: uuid("status_changed_by").references(() => users.id),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("command_tasks_venture_request_uq").on(t.ventureId, t.requestId),
    index("command_tasks_venture_status_idx").on(t.ventureId, t.status, t.dueOn),
    check("command_tasks_title_ck", sql`length(btrim(${t.title})) between 1 and 200`),
    check(
      "command_tasks_status_change_ck",
      sql`(${t.statusChangedAt} is null) = (${t.statusChangedBy} is null)`,
    ),
  ],
);
