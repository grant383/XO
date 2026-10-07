import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import {
  stripeRedirect,
  verifyBillingEvent,
  STRIPE_API_VERSION,
  StripeBillingProvider,
} from "@/modules/billing/provider";
const secret = "whsec_synthetic_fixture_only_not_a_real_key";
const payload = JSON.stringify({
  id: "evt_fixture",
  type: "customer.subscription.updated",
  data: { object: { id: "sub_fixture", customer: "cus_fixture" } },
});
const signature = (body = payload, timestamp = Math.floor(Date.now() / 1000)) =>
  Stripe.webhooks.generateTestHeaderString({ payload: body, secret, timestamp });

describe("billing webhook validation", () => {
  it("accepts a signed raw event and retains only routing references", () => {
    expect(verifyBillingEvent(payload, signature(), secret)).toEqual({
      id: "evt_fixture",
      type: "customer.subscription.updated",
      subscriptionId: "sub_fixture",
      customerId: "cus_fixture",
    });
  });
  it("rejects tampering, missing signatures, old replays and future timestamps", () => {
    expect(() => verifyBillingEvent(payload + " ", signature(), secret)).toThrow();
    expect(() => verifyBillingEvent(payload, "", secret)).toThrow();
    expect(() =>
      verifyBillingEvent(payload, signature(payload, Math.floor(Date.now() / 1000) - 600), secret),
    ).toThrow();
    expect(() =>
      verifyBillingEvent(payload, signature(payload, Math.floor(Date.now() / 1000) + 600), secret),
    ).toThrow();
  });
  it("ignores unrelated signed event types without trusting their object payload", () => {
    const body = JSON.stringify({ id: "evt_other", type: "invoice.paid", data: { object: {} } });
    expect(verifyBillingEvent(body, signature(body), secret)).toMatchObject({
      id: "evt_other",
      customerId: null,
    });
  });
});
describe("Stripe adapter contract", () => {
  it("allows only secure hosted Checkout or billing portal redirects", () => {
    expect(stripeRedirect("https://checkout.stripe.com/c/pay/cs_fixture")).toContain(
      "checkout.stripe.com",
    );
    for (const url of [
      "https://evil.test",
      "http://billing.stripe.com",
      "https://billing.stripe.com.evil.test",
      "https://user:pass@billing.stripe.com",
    ])
      expect(() => stripeRedirect(url)).toThrow();
  });
  it("uses a pinned API, server-selected price/customer, account metadata and idempotency keys", async () => {
    const requests: Array<{ url: string; headers: Headers; body: string }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      requests.push({ url, headers: new Headers(init?.headers), body: String(init?.body ?? "") });
      return Response.json(
        url.endsWith("/customers")
          ? { id: "cus_fixture" }
          : {
              id: "cs_test_fixture",
              url: "https://checkout.stripe.com/c/pay/cs_fixture",
              expires_at: Math.floor(Date.now() / 1000) + 3600,
            },
      );
    };
    const client = new Stripe("sk_test_synthetic_fixture", {
      apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
      httpClient: Stripe.createFetchHttpClient(fetcher),
      maxNetworkRetries: 0,
    });
    const provider = new StripeBillingProvider({
      secretKey: "sk_test_synthetic_fixture",
      priceId: "price_fixture",
      appUrl: "https://directorxo.test/",
      client,
    });
    const account = randomUUID();
    const request = randomUUID();
    const customer = await provider.createCustomer(account);
    await provider.createCheckout(account, customer, request);
    expect(requests[0]?.headers.get("stripe-version")).toBe(STRIPE_API_VERSION);
    expect(requests[0]?.headers.get("idempotency-key")).toBe(`dxo-customer-${account}`);
    expect(requests[1]?.headers.get("idempotency-key")).toBe(`dxo-checkout-${account}-${request}`);
    const form = new URLSearchParams(requests[1]?.body);
    expect(form.get("customer")).toBe("cus_fixture");
    expect(form.get("line_items[0][price]")).toBe("price_fixture");
    expect(form.get("subscription_data[metadata][billing_account_id]")).toBe(account);
    expect(form.get("success_url")).toBe(
      "https://directorxo.test/settings/billing?checkout=complete",
    );
  });
});
