"use server";
import {
  BillingConflictError,
  BillingPermissionError,
  BillingUnavailableError,
  startBillingCommand,
} from "@/modules/billing";
import { logger } from "@/platform/observability/logger";
import { requireActor } from "../../actor";
export type BillingActionState = { message: string; url?: string };
export async function openBillingAction(
  _: BillingActionState,
  form: FormData,
): Promise<BillingActionState> {
  const actor = await requireActor("/settings/billing");
  try {
    const result = await startBillingCommand(actor, {
      accountId: form.get("accountId"),
      requestId: form.get("requestId"),
      action: form.get("action"),
    });
    return { message: "Your secure billing session is ready.", url: result.url };
  } catch (error) {
    if (error instanceof BillingPermissionError)
      return { message: "Billing account ownership is required." };
    if (error instanceof BillingConflictError || error instanceof BillingUnavailableError)
      return { message: error.message };
    logger.error(
      { event: "billing.session.failed", correlationId: actor.correlationId },
      "Billing session failed",
    );
    return { message: "Unable to open billing. Please try again." };
  }
}
