import { and, count, desc, eq, gte, isNull, lt, lte, or } from "drizzle-orm";
import { schema, withTenant, withUser } from "@/platform/db";
import { resolveSelectedVenture, type Actor } from "@/modules/ventures";
import { inboxQuery, readInput } from "./policy";
const { notifications, auditLog } = schema;

export async function getInbox(actor: Actor, input: unknown = {}) {
  const query = inboxQuery.parse(input);
  const asOf = new Date();
  return withUser(actor, async (tx) => {
    const after = query.cursor;
    const rows = await tx
      .select({
        id: notifications.id,
        action: notifications.action,
        createdAt: notifications.createdAt,
        readAt: notifications.readAt,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, actor.userId),
          query.unread ? isNull(notifications.readAt) : undefined,
          after
            ? or(
                lt(notifications.createdAt, new Date(after.at)),
                and(
                  eq(notifications.createdAt, new Date(after.at)),
                  lt(notifications.id, after.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(31);
    const [total] = await tx
      .select({ value: count() })
      .from(notifications)
      .where(eq(notifications.userId, actor.userId));
    const [unread] = await tx
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, actor.userId), isNull(notifications.readAt)));
    const [week] = await tx
      .select({ value: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, actor.userId),
          gte(notifications.createdAt, new Date(asOf.getTime() - 7 * 86400_000)),
        ),
      );
    const items = rows.slice(0, 30);
    const last = items.at(-1);
    return {
      items,
      total: total?.value ?? 0,
      unread: unread?.value ?? 0,
      thisWeek: week?.value ?? 0,
      asOf: asOf.toISOString(),
      nextCursor:
        rows.length > 30 && last ? { at: last.createdAt.toISOString(), id: last.id } : null,
    };
  });
}

/** An explicit rendered cutoff prevents marking newly arrived notifications as read. */
export async function markNotificationsRead(actor: Actor, input: unknown) {
  const query = readInput.parse(input);
  const cutoff = new Date(query.through);
  if (cutoff.getTime() > Date.now() + 1000) throw new Error("Invalid notification cutoff");
  return withUser(actor, async (tx) => {
    const changed = await tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.userId, actor.userId),
          isNull(notifications.readAt),
          lte(notifications.createdAt, cutoff),
          query.id ? eq(notifications.id, query.id) : undefined,
        ),
      )
      .returning({ id: notifications.id });
    return { updated: changed.length };
  });
}

/** Account page may select a venture, but only re-resolved active Owners/Admins can read its audit. */
export async function getVentureActivity(actor: Actor, ventureId: string) {
  const access = await resolveSelectedVenture(actor, ventureId, "team:view");
  return withTenant(
    { userId: actor.userId, ventureId: access.id, correlationId: actor.correlationId },
    (tx) =>
      tx
        .select({
          id: auditLog.id,
          action: auditLog.action,
          outcome: auditLog.outcome,
          occurredAt: auditLog.occurredAt,
        })
        .from(auditLog)
        .where(eq(auditLog.ventureId, access.id))
        .orderBy(desc(auditLog.occurredAt), desc(auditLog.id))
        .limit(30),
  );
}
export { inboxQuery, readInput, eventLabel, ventureEventLabel } from "./policy";
