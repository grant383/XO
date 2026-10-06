import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { auditLog } from "./audit";
import { users } from "./identity";
import { id } from "./types";

/** Account inbox projection of account audit events. Venture audit rows remain venture-scoped. */
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    auditEventId: uuid("audit_event_id")
      .notNull()
      .references(() => auditLog.id),
    action: text("action").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("notifications_event_user_uq").on(t.auditEventId, t.userId),
    index("notifications_user_time_idx").on(t.userId, t.createdAt.desc(), t.id.desc()),
  ],
);
