import Stripe from "stripe";
import { z } from "zod";

export const STRIPE_API_VERSION = "2025-02-24.acacia";
const stripeId = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9_]+$`));
const customerId = stripeId("cus");
const subscriptionId = stripeId("sub");
const price = z.object({
  id: stripeId("price"),
  unit_amount: z.number().int().nonnegative().nullable(),
  currency: z.string().regex(/^[a-z]{3}$/),
  recurring: z
    .object({
      interval: z.enum(["day", "week", "month", "year"]),
      interval_count: z.number().int().positive(),
    })
    .nullable(),
});
const subscription = z.object({
  id: subscriptionId,
  customer: customerId,
  status: z.enum([
    "incomplete",
    "incomplete_expired",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "unpaid",
    "paused",
  ]),
  current_period_end: z.number().int(),
  cancel_at_period_end: z.boolean(),
  items: z.object({ data: z.array(z.object({ price })).length(1) }),
});
export type SubscriptionSnapshot = {
  id: string;
  customerId: string;
  status: string;
  priceId: string;
  amountMinor: number;
  currency: string;
  interval: string;
  intervalCount: number;
  periodEnd: Date;
  cancelAtPeriodEnd: boolean;
};
export interface BillingProvider {
  createCustomer(accountId: string): Promise<string>;
  createCheckout(
    accountId: string,
    customerId: string,
    requestId: string,
  ): Promise<{ id: string; url: string; expiresAt: Date }>;
  retrieveCheckout(
    id: string,
  ): Promise<{ id: string; url: string | null; status: string; expiresAt: Date }>;
  createPortal(customerId: string, requestId: string): Promise<string>;
  retrieveSubscription(id: string): Promise<SubscriptionSnapshot>;
}
export class BillingUnavailableError extends Error {
  constructor() {
    super("Subscription billing is not configured or is temporarily unavailable");
  }
}
export function stripeRedirect(url: string) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.port !== "" ||
    parsed.username ||
    parsed.password ||
    !["checkout.stripe.com", "billing.stripe.com"].includes(parsed.hostname)
  )
    throw new BillingUnavailableError();
  return url;
}

/** Official SDK; fixed API version, bounded retries/timeouts, no secrets or response bodies logged. */
export class StripeBillingProvider implements BillingProvider {
  private client: Stripe;
  constructor(
    private config: { secretKey: string; priceId: string; appUrl: string; client?: Stripe },
  ) {
    stripeId("price").parse(config.priceId);
    this.client =
      config.client ??
      new Stripe(config.secretKey, {
        apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
        maxNetworkRetries: 2,
        timeout: 10_000,
      });
  }
  async createCustomer(accountId: string) {
    const customer = await this.client.customers.create(
      { metadata: { billing_account_id: z.uuid().parse(accountId) } },
      { idempotencyKey: `dxo-customer-${accountId}` },
    );
    return customerId.parse(customer.id);
  }
  async createCheckout(accountId: string, customer: string, requestId: string) {
    const session = await this.client.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId.parse(customer),
        client_reference_id: z.uuid().parse(accountId),
        line_items: [{ price: this.config.priceId, quantity: 1 }],
        metadata: { billing_account_id: accountId },
        subscription_data: { metadata: { billing_account_id: accountId } },
        success_url: new URL("/settings/billing?checkout=complete", this.config.appUrl).toString(),
        cancel_url: new URL("/settings/billing", this.config.appUrl).toString(),
      },
      { idempotencyKey: `dxo-checkout-${accountId}-${z.uuid().parse(requestId)}` },
    );
    if (!session.url) throw new BillingUnavailableError();
    return {
      id: stripeId("cs").parse(session.id),
      url: stripeRedirect(session.url),
      expiresAt: new Date(session.expires_at * 1000),
    };
  }
  async retrieveCheckout(id: string) {
    const session = await this.client.checkout.sessions.retrieve(stripeId("cs").parse(id));
    return {
      id: session.id,
      url: session.url ? stripeRedirect(session.url) : null,
      status: session.status ?? "unknown",
      expiresAt: new Date(session.expires_at * 1000),
    };
  }
  async createPortal(customer: string, requestId: string) {
    const session = await this.client.billingPortal.sessions.create(
      {
        customer: customerId.parse(customer),
        return_url: new URL("/settings/billing", this.config.appUrl).toString(),
      },
      { idempotencyKey: `dxo-portal-${customer}-${z.uuid().parse(requestId)}` },
    );
    return stripeRedirect(session.url);
  }
  async retrieveSubscription(id: string): Promise<SubscriptionSnapshot> {
    const parsed = subscription.parse(
      await this.client.subscriptions.retrieve(subscriptionId.parse(id)),
    );
    const p = parsed.items.data[0]!.price;
    if (p.id !== this.config.priceId || !p.recurring || p.unit_amount === null)
      throw new BillingUnavailableError();
    return {
      id: parsed.id,
      customerId: parsed.customer,
      status: parsed.status,
      priceId: p.id,
      amountMinor: p.unit_amount,
      currency: p.currency.toUpperCase(),
      interval: p.recurring.interval,
      intervalCount: p.recurring.interval_count,
      periodEnd: new Date(parsed.current_period_end * 1000),
      cancelAtPeriodEnd: parsed.cancel_at_period_end,
    };
  }
}

/** Validates the untouched raw body and timestamp using the SDK, then keeps only routing references. */
export function verifyBillingEvent(body: string, signature: string, secret: string) {
  const timestamps = signature.split(",").filter((part) => part.startsWith("t="));
  if (
    timestamps.length !== 1 ||
    !timestamps[0] ||
    !/^t=\d+$/.test(timestamps[0]) ||
    Number(timestamps[0].slice(2)) > Date.now() / 1000 + 300
  )
    throw new Error("Invalid billing signature timestamp");
  const event = Stripe.webhooks.constructEvent(body, signature, secret, 300);
  if (
    ![
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "checkout.session.completed",
    ].includes(event.type)
  )
    return {
      id: stripeId("evt").parse(event.id),
      type: event.type,
      subscriptionId: null,
      customerId: null,
    };
  const data = z
    .object({
      id: z.string(),
      customer: customerId.optional(),
      subscription: subscriptionId.nullable().optional(),
    })
    .parse(event.data.object);
  return {
    id: stripeId("evt").parse(event.id),
    type: event.type,
    subscriptionId: event.type.startsWith("customer.subscription.")
      ? subscriptionId.parse(data.id)
      : (data.subscription ?? null),
    customerId: data.customer ?? null,
  };
}
