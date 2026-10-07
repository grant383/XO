import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, withService, withUser, type Tx } from "@/platform/db";
import type { Actor } from "@/modules/ventures";
import {
  BillingUnavailableError,
  StripeBillingProvider,
  verifyBillingEvent,
  stripeRedirect,
  type BillingProvider,
} from "./provider";
const {
  billingAccounts,
  billingAccountMembers,
  subscriptions,
  ventureEntitlements,
  ventures,
  billingWebhookEvents,
  auditLog,
} = schema;
export class BillingPermissionError extends Error {
  constructor() {
    super("Billing account access is required");
  }
}
export class BillingConflictError extends Error {
  constructor(message: string) {
    super(message);
  }
}
import { billingCommand } from "./policy";
export { billingCommand } from "./policy";
const providerConfig = z.object({
  STRIPE_SECRET_KEY: z.string().regex(/^sk_(test|live)_/),
  STRIPE_RECURRING_PRICE_ID: z.string().regex(/^price_[A-Za-z0-9_]+$/),
  STRIPE_WEBHOOK_SECRET: z
    .string()
    .regex(/^whsec_/)
    .min(20),
  APP_URL: z.url({ protocol: /^https?$/ }),
});
let testProvider: BillingProvider | undefined;
export function setBillingProviderForTests(provider: BillingProvider | undefined) {
  testProvider = provider;
}
export function billingConfigured() {
  return !!testProvider || providerConfig.safeParse(process.env).success;
}
function provider(): BillingProvider {
  if (testProvider) return testProvider;
  const config = providerConfig.safeParse(process.env);
  if (!config.success) throw new BillingUnavailableError();
  return new StripeBillingProvider({
    secretKey: config.data.STRIPE_SECRET_KEY,
    priceId: config.data.STRIPE_RECURRING_PRICE_ID,
    appUrl: config.data.APP_URL,
  });
}
async function billingService<T>(
  accountId: string,
  serviceId: "billing:stripe" | "webhook:stripe",
  correlationId: string | undefined,
  fn: (tx: Tx) => Promise<T>,
) {
  const id = z.uuid().parse(accountId);
  return withService({ serviceId, correlationId }, async (tx) => {
    await tx.execute(sql`select set_config('app.billing_account_id', ${id}, true)`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${id}, 71))`);
    return fn(tx);
  });
}
const subscriptionSelection = {
  status: subscriptions.status,
  priceId: subscriptions.priceId,
  amountMinor: subscriptions.amountMinor,
  currency: subscriptions.currency,
  interval: subscriptions.interval,
  intervalCount: subscriptions.intervalCount,
  periodEnd: subscriptions.periodEnd,
  cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
  syncedAt: subscriptions.syncedAt,
};

export async function listBillingAccounts(actor: Actor) {
  return withUser(actor, (tx) =>
    tx
      .select({ id: billingAccounts.id, name: billingAccounts.name })
      .from(billingAccounts)
      .innerJoin(
        billingAccountMembers,
        and(
          eq(billingAccountMembers.billingAccountId, billingAccounts.id),
          eq(billingAccountMembers.userId, actor.userId),
          eq(billingAccountMembers.active, true),
          eq(billingAccountMembers.role, "owner"),
        ),
      )
      .orderBy(billingAccounts.id),
  );
}
export async function getBillingOverview(actor: Actor, accountId: string) {
  z.uuid().parse(accountId);
  return withUser(actor, async (tx) => {
    const [account] = await tx
      .select({
        id: billingAccounts.id,
        name: billingAccounts.name,
        hasCustomer: sql<boolean>`${billingAccounts.stripeCustomerId} is not null`,
      })
      .from(billingAccounts)
      .where(eq(billingAccounts.id, accountId));
    if (!account) throw new BillingPermissionError();
    const [subscription] = await tx
      .select(subscriptionSelection)
      .from(subscriptions)
      .where(eq(subscriptions.billingAccountId, accountId));
    const entitlements = await tx
      .select({ ventureId: ventures.id, name: ventures.name, enabled: ventureEntitlements.enabled })
      .from(ventureEntitlements)
      .innerJoin(ventures, eq(ventures.id, ventureEntitlements.ventureId))
      .where(eq(ventureEntitlements.billingAccountId, accountId))
      .orderBy(ventures.name, ventures.id);
    return {
      account,
      subscription: subscription ?? null,
      entitlements,
      configured: billingConfigured(),
    };
  });
}

/** Server-selected Stripe customer/price; account membership is locked and rechecked in the mutation transaction. */
export async function startBillingCommand(actor: Actor, input: unknown) {
  const command = billingCommand.parse(input);
  return billingService(command.accountId, "billing:stripe", actor.correlationId, async (tx) => {
    const owner = await tx.execute<{ allowed: boolean }>(
      sql`select app.lock_billing_owner(${command.accountId}, ${z.uuid().parse(actor.userId)}) as allowed`,
    );
    if (!owner[0]?.allowed) throw new BillingPermissionError();
    const [account] = await tx
      .select()
      .from(billingAccounts)
      .where(eq(billingAccounts.id, command.accountId));
    if (!account) throw new BillingPermissionError();
    const stripe = provider();
    let customer = account.stripeCustomerId;
    if (!customer) {
      if (command.action === "portal")
        throw new BillingConflictError("Start a subscription before opening billing management.");
      customer = await stripe.createCustomer(account.id);
      await tx
        .update(billingAccounts)
        .set({ stripeCustomerId: customer, updatedAt: new Date() })
        .where(eq(billingAccounts.id, account.id));
    }
    let url: string;
    if (command.action === "portal") url = await stripe.createPortal(customer, command.requestId);
    else {
      const [current] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.billingAccountId, account.id));
      if (current && !["canceled", "incomplete_expired", "incomplete"].includes(current.status))
        throw new BillingConflictError(
          "A subscription already exists. Manage it in the billing portal.",
        );
      if (account.checkoutSessionId) {
        const existing = await stripe.retrieveCheckout(account.checkoutSessionId);
        if (existing.status === "complete")
          throw new BillingConflictError(
            "Your checkout is complete. Wait for the subscription update before starting another checkout.",
          );
        if (existing.status === "open" && existing.expiresAt > new Date() && existing.url)
          return { url: stripeRedirect(existing.url) };
      }
      if (current?.status === "incomplete")
        throw new BillingConflictError(
          "Finish the existing subscription before starting another checkout.",
        );
      const checkout = await stripe.createCheckout(account.id, customer, command.requestId);
      await tx
        .update(billingAccounts)
        .set({
          checkoutSessionId: checkout.id,
          checkoutExpiresAt: checkout.expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(billingAccounts.id, account.id));
      url = checkout.url;
    }
    await tx.insert(auditLog).values({
      actorType: "service",
      actorService: "billing:stripe",
      actorUserId: actor.userId,
      subjectUserId: actor.userId,
      action: `billing.${command.action}.opened`,
      targetType: "billing_account",
      targetId: account.id,
      correlationId: actor.correlationId,
    });
    return { url: stripeRedirect(url) };
  });
}

/** Signature validation precedes all lookups. Dedupe, fresh provider state, entitlement update and audit commit together. */
export async function processBillingWebhook(
  body: string,
  signature: string,
  secret: string,
  correlationId: string,
) {
  const event = verifyBillingEvent(body, signature, secret);
  if (!event.customerId || !event.subscriptionId) return { status: "ignored" };
  const accountId = await withService(
    { serviceId: "webhook:stripe", correlationId },
    async (tx) => {
      const rows = await tx.execute<{ account_id: string | null }>(
        sql`select app.billing_account_for_customer(${event.customerId}) as account_id`,
      );
      return rows[0]?.account_id;
    },
  );
  if (!accountId) return { status: "ignored" };
  return billingService(accountId, "webhook:stripe", correlationId, async (tx) => {
    const [seen] = await tx
      .select()
      .from(billingWebhookEvents)
      .where(eq(billingWebhookEvents.providerEventId, event.id));
    if (seen) return { status: "duplicate" };
    const snapshot = await provider().retrieveSubscription(event.subscriptionId!);
    if (snapshot.customerId !== event.customerId || snapshot.id !== event.subscriptionId)
      throw new BillingUnavailableError();
    const [account] = await tx
      .select()
      .from(billingAccounts)
      .where(eq(billingAccounts.id, accountId));
    if (!account) throw new BillingUnavailableError();
    const [current] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.billingAccountId, accountId));
    if (
      !current ||
      current.stripeSubscriptionId === snapshot.id ||
      (["canceled", "incomplete_expired"].includes(current.status) &&
        !["canceled", "incomplete_expired"].includes(snapshot.status))
    ) {
      const values = {
        billingAccountId: accountId,
        stripeSubscriptionId: snapshot.id,
        status: snapshot.status,
        priceId: snapshot.priceId,
        amountMinor: snapshot.amountMinor,
        currency: snapshot.currency,
        interval: snapshot.interval,
        intervalCount: snapshot.intervalCount,
        periodEnd: snapshot.periodEnd,
        cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
        syncedAt: new Date(),
      };
      await tx
        .insert(subscriptions)
        .values(values)
        .onConflictDoUpdate({ target: subscriptions.billingAccountId, set: values });
      await tx
        .update(ventureEntitlements)
        .set({ enabled: ["active", "trialing"].includes(snapshot.status), updatedAt: new Date() })
        .where(eq(ventureEntitlements.billingAccountId, accountId));
      // Retire only a provider-confirmed closed checkout. A later cancellation can
      // then start a new subscription, while a newly opened checkout stays reusable.
      if (account.checkoutSessionId) {
        const checkout = await provider().retrieveCheckout(account.checkoutSessionId);
        if (checkout.id !== account.checkoutSessionId) throw new BillingUnavailableError();
        if (["complete", "expired"].includes(checkout.status)) {
          await tx
            .update(billingAccounts)
            .set({ checkoutSessionId: null, checkoutExpiresAt: null, updatedAt: new Date() })
            .where(eq(billingAccounts.id, accountId));
        }
      }
      await tx.insert(auditLog).values({
        actorType: "service",
        actorService: "webhook:stripe",
        subjectUserId: account.createdBy,
        action: "billing.subscription.updated",
        targetType: "billing_account",
        targetId: accountId,
        correlationId,
        metadata: {
          providerEventId: event.id,
          subscriptionId: snapshot.id,
          status: snapshot.status,
          amountMinor: snapshot.amountMinor,
          currency: snapshot.currency,
          priceId: snapshot.priceId,
        },
      });
    }
    await tx
      .insert(billingWebhookEvents)
      .values({ billingAccountId: accountId, providerEventId: event.id, eventType: event.type });
    return { status: "processed" };
  });
}
export {
  BillingUnavailableError,
  StripeBillingProvider,
  STRIPE_API_VERSION,
  verifyBillingEvent,
  stripeRedirect,
} from "./provider";
export type { BillingProvider, SubscriptionSnapshot } from "./provider";
