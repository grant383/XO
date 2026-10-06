import { and, desc, eq, lt, or } from "drizzle-orm";
import { redis } from "@/platform/redis";
import { RedisRateLimitStore } from "@/platform/security";
import { schema, withUser } from "@/platform/db";
import type { Actor } from "@/modules/ventures";
import { supportCursor, supportInput, type SupportCursor } from "./policy";

const { supportRequests, auditLog } = schema;
const selection = {
  id: supportRequests.id,
  subject: supportRequests.subject,
  description: supportRequests.description,
  status: supportRequests.status,
  createdAt: supportRequests.createdAt,
};

export async function listSupportRequests(actor: Actor, cursor?: SupportCursor) {
  const after = cursor === undefined ? undefined : supportCursor.parse(cursor);
  return withUser(actor, async (tx) => {
    const rows = await tx
      .select(selection)
      .from(supportRequests)
      .where(
        and(
          eq(supportRequests.userId, actor.userId),
          after
            ? or(
                lt(supportRequests.createdAt, new Date(after.at)),
                and(
                  eq(supportRequests.createdAt, new Date(after.at)),
                  lt(supportRequests.id, after.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(supportRequests.createdAt), desc(supportRequests.id))
      .limit(21);
    const items = rows.slice(0, 20);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > 20 && last ? { at: last.createdAt.toISOString(), id: last.id } : null,
    };
  });
}

/** Retry-safe creation and audit are atomic. RLS independently checks account ownership. */
export async function createSupportRequest(actor: Actor, input: unknown) {
  const parsed = supportInput.safeParse(input);
  if (!parsed.success)
    return { ok: false as const, code: "VALIDATION", message: "Check the request details" };
  const limit = await new RedisRateLimitStore(redis()).consume(`support:create:${actor.userId}`, {
    windowSec: 3600,
    max: 20,
  });
  if (!limit.allowed)
    return {
      ok: false as const,
      code: "LIMIT",
      message: "Too many support requests. Please try again later.",
    };
  return withUser(actor, async (tx) => {
    const [created] = await tx
      .insert(supportRequests)
      .values({
        userId: actor.userId,
        ...parsed.data,
      })
      .onConflictDoNothing()
      .returning(selection);
    if (created) {
      await tx.insert(auditLog).values({
        actorType: "user",
        actorUserId: actor.userId,
        subjectUserId: actor.userId,
        action: "support.request.created",
        targetType: "support_request",
        targetId: created.id,
        correlationId: actor.correlationId,
      });
      return { ok: true as const, data: created };
    }
    const [existing] = await tx
      .select(selection)
      .from(supportRequests)
      .where(
        and(
          eq(supportRequests.userId, actor.userId),
          eq(supportRequests.requestId, parsed.data.requestId),
        ),
      );
    if (
      !existing ||
      existing.subject !== parsed.data.subject ||
      existing.description !== parsed.data.description
    )
      return {
        ok: false as const,
        code: "CONFLICT",
        message: "This request identifier was already used. Start a new request.",
      };
    return { ok: true as const, data: existing };
  });
}

export { supportInput, supportCursor } from "./policy";
