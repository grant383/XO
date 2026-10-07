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

import { normalizeStripeMinorAmount } from "@/modules/billing/provider";
describe("Stripe amounts at the ISO minor-unit boundary", () => {
  it.each([
    [2500, "GBP", 2500],
    [500, "JPY", 500],
    [500, "ISK", 5],
    [500, "UGX", 5],
    [500, "MGA", 50000],
    [1045, "HUF", 1045],
  ])("normalizes %i %s provider units to %i ISO minor units", (amount, currency, expected) => {
    expect(normalizeStripeMinorAmount(amount, currency)).toBe(expected);
  });
  it("rejects fractional zero-decimal charges, unknown currencies and unsafe amounts", () => {
    for (const [amount, currency] of [
      [501, "ISK"],
      [501, "UGX"],
      [2500, "ZZZ"],
      [-1, "GBP"],
      [Number.MAX_SAFE_INTEGER, "MGA"],
    ] as const)
      expect(() => normalizeStripeMinorAmount(amount, currency)).toThrow();
  });
});

import { formatBillingAmount } from "@/modules/billing/money";
import {
  billingIntervalLabel,
  ENTITLING_STATUSES,
  presentSubscription,
} from "@/modules/billing/presentation";
it("renders ISO minor amounts without rounding away HUF or MGA fractional precision", () => {
  expect(formatBillingAmount(1045, "HUF")).toContain("10.45");
  expect(formatBillingAmount(50000, "MGA")).toContain("500.00");
  expect(formatBillingAmount(500, "JPY")).not.toContain(".00");
});

it("normalizes a provider subscription snapshot before returning its data contract", async () => {
  const client = new Stripe("sk_test_synthetic_fixture", {
    apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
    maxNetworkRetries: 0,
    httpClient: Stripe.createFetchHttpClient(async () =>
      Response.json({
        id: "sub_fixture",
        customer: "cus_fixture",
        status: "active",
        current_period_end: 1800000000,
        cancel_at_period_end: false,
        items: {
          data: [
            {
              price: {
                id: "price_fixture",
                unit_amount: 500,
                currency: "isk",
                recurring: { interval: "month", interval_count: 1 },
              },
            },
          ],
        },
      }),
    ),
  });
  const provider = new StripeBillingProvider({
    secretKey: "sk_test_synthetic_fixture",
    priceId: "price_fixture",
    appUrl: "https://directorxo.test",
    client,
  });
  const result = await provider.retrieveSubscription("sub_fixture");
  expect(result.amountMinor).toBe(5);
  expect(result.currency).toBe("ISK");
});

describe("subscription presentation", () => {
  it.each([
    ["active", "Active", "success", true, false],
    ["trialing", "Trial", "success", true, false],
    ["past_due", "Past due", "warning", true, true],
    ["unpaid", "Unpaid", "danger", true, true],
    ["incomplete", "Incomplete", "warning", true, true],
    ["paused", "Paused", "neutral", true, true],
    ["canceled", "Canceled", "neutral", false, true],
    ["incomplete_expired", "Expired", "neutral", false, true],
  ] as const)("%s → %s", (status, label, tone, subscribed, hasNotice) => {
    const p = presentSubscription(status);
    expect(p).toMatchObject({ label, tone, subscribed });
    expect(Boolean(p.notice)).toBe(hasNotice);
  });

  it("enables entitlements only for active and trialing subscriptions (ADR-0019)", () => {
    expect([...ENTITLING_STATUSES].sort()).toEqual(["active", "trialing"]);
  });

  it("labels billing intervals", () => {
    expect(billingIntervalLabel("month", 1)).toBe("/ month");
    expect(billingIntervalLabel("month", 3)).toBe("/ 3 months");
  });
});
