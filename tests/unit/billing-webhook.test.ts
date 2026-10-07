import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { processEvent, log } = vi.hoisted(() => ({
  processEvent: vi.fn(),
  log: { info: vi.fn(), error: vi.fn() },
}));
vi.mock("@/modules/billing", async () => {
  const actual = await vi.importActual<typeof import("@/modules/billing/provider")>(
    "@/modules/billing/provider",
  );
  return { verifyBillingEvent: actual.verifyBillingEvent, processBillingWebhook: processEvent };
});
vi.mock("@/platform/observability/logger", () => ({ logger: log }));
import { POST } from "@/app/api/v1/webhooks/stripe/route";
const secret = "whsec_synthetic_webhook_fixture";
const body = JSON.stringify({
  id: "evt_fixture",
  type: "customer.subscription.updated",
  data: { object: { id: "sub_fixture", customer: "cus_fixture" } },
});
const request = (payload: string, signature?: string) =>
  new Request("http://localhost/api/v1/webhooks/stripe", {
    method: "POST",
    body: payload,
    headers: signature ? { "stripe-signature": signature } : undefined,
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
  processEvent.mockResolvedValue({ status: "processed" });
});
afterEach(() => vi.unstubAllEnvs());
describe("billing webhook HTTP boundary", () => {
  it("fails closed without provider configuration", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect((await POST(request(body))).status).toBe(503);
    expect(processEvent).not.toHaveBeenCalled();
  });
  it("rejects missing, changed and oversized bodies before provider/database work", async () => {
    const signature = Stripe.webhooks.generateTestHeaderString({ payload: body, secret });
    expect((await POST(request(body))).status).toBe(400);
    expect((await POST(request(body + " ", signature))).status).toBe(400);
    expect((await POST(request("a".repeat(131073), signature))).status).toBe(413);
    expect(processEvent).not.toHaveBeenCalled();
  });
  it("accepts signed provider requests without user cookies and keeps retries safe", async () => {
    const signature = Stripe.webhooks.generateTestHeaderString({ payload: body, secret });
    const response = await POST(request(body, signature));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "processed" });
    expect(processEvent).toHaveBeenCalledWith(body, signature, secret, expect.any(String));
    processEvent.mockRejectedValue(new Error("secret-provider-response"));
    const failure = await POST(request(body, signature));
    expect(failure.status).toBe(503);
    expect(JSON.stringify(await failure.json())).not.toContain("secret-provider-response");
    expect(JSON.stringify(log.error.mock.calls)).not.toMatch(/secret-provider-response|whsec_/);
  });
});
