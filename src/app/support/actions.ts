"use server";
import { revalidatePath } from "next/cache";
import { requireActor } from "../actor";
import { createSupportRequest } from "@/modules/support";
import { logger } from "@/platform/observability/logger";

export type SupportFormState = { ok: boolean; message: string };
export async function submitSupportAction(
  _: SupportFormState,
  form: FormData,
): Promise<SupportFormState> {
  const actor = await requireActor("/support");
  try {
    const result = await createSupportRequest(actor, {
      requestId: form.get("requestId"),
      subject: form.get("subject"),
      description: form.get("description"),
    });
    if (!result.ok) return { ok: false, message: result.message };
    revalidatePath("/support");
    return { ok: true, message: "Your support request has been submitted." };
  } catch {
    logger.error(
      { correlationId: actor.correlationId, event: "support.request.failed" },
      "Support request failed",
    );
    return { ok: false, message: "Unable to submit your request. Please try again." };
  }
}
