import { randomUUID } from "node:crypto";
import { processBillingWebhook, verifyBillingEvent } from "@/modules/billing";
import { logger } from "@/platform/observability/logger";
import { HttpError, readBody } from "../../../_shared/account";
export async function POST(request: Request) {
  const correlationId = randomUUID();
  const start = performance.now();
  let status = 200;
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !/^whsec_.{14,}$/.test(secret))
      throw new HttpError(503, "UNAVAILABLE", "Subscription billing is unavailable");
    const signature = request.headers.get("stripe-signature");
    if (!signature) throw new HttpError(400, "SIGNATURE", "A valid billing signature is required");
    const body = await readBody(request, 131_072);
    try {
      verifyBillingEvent(body, signature, secret);
    } catch {
      throw new HttpError(400, "SIGNATURE", "A valid billing signature is required");
    }
    const result = await processBillingWebhook(body, signature, secret, correlationId);
    return Response.json(result, {
      headers: { "x-correlation-id": correlationId, "cache-control": "no-store" },
    });
  } catch (error) {
    status = error instanceof HttpError ? error.status : 503;
    if (status === 503)
      logger.error(
        { event: "billing.webhook.failed", correlationId, status },
        "Billing webhook unavailable",
      );
    return Response.json(
      {
        error: {
          code: error instanceof HttpError ? error.code : "UNAVAILABLE",
          message:
            error instanceof HttpError
              ? error.message
              : "Subscription update is temporarily unavailable",
          correlationId,
        },
      },
      { status, headers: { "x-correlation-id": correlationId, "cache-control": "no-store" } },
    );
  } finally {
    logger.info(
      {
        event: "billing.webhook.request",
        correlationId,
        status,
        durationMs: Math.round(performance.now() - start),
      },
      "Billing webhook request",
    );
  }
}
