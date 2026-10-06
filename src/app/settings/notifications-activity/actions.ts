"use server";
import { revalidatePath } from "next/cache";
import { markNotificationsRead } from "@/modules/notifications";
import { logger } from "@/platform/observability/logger";
import { requireActor } from "../../actor";
export async function markReadAction(_: { message: string }, form: FormData) {
  const actor = await requireActor("/settings/notifications-activity");
  try {
    await markNotificationsRead(actor, {
      through: form.get("through"),
      ...(form.get("id") ? { id: form.get("id") } : {}),
    });
    revalidatePath("/settings/notifications-activity");
    return { message: "Notifications marked as read." };
  } catch {
    logger.error(
      { correlationId: actor.correlationId, event: "notifications.read.failed" },
      "Notification update failed",
    );
    return { message: "Unable to update notifications. Please try again." };
  }
}
