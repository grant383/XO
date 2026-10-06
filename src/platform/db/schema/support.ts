import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";
import { id, timestamps } from "./types";

/** Account-owned requests. They confer no support access to any venture (spec §15). */
export const supportRequests = pgTable(
  "support_requests",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    requestId: uuid("request_id").notNull(),
    subject: text("subject").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull().default("open"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("support_requests_user_request_uq").on(t.userId, t.requestId),
    index("support_requests_user_time_idx").on(t.userId, t.createdAt.desc(), t.id.desc()),
    check("support_requests_subject_ck", sql`length(btrim(${t.subject})) between 1 and 200`),
    check(
      "support_requests_description_ck",
      sql`length(btrim(${t.description})) between 10 and 5000`,
    ),
    check(
      "support_requests_status_ck",
      sql`${t.status} in ('open', 'waiting', 'resolved', 'closed')`,
    ),
  ],
);
