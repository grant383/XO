import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { sql } from "drizzle-orm";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getBillingOverview,
  listBillingAccounts,
  startBillingCommand,
  processBillingWebhook,
  setBillingProviderForTests,
  type BillingProvider,
  type SubscriptionSnapshot,
} from "@/modules/billing";
import { closePools, withUser, withService } from "@/platform/db";
import { adminSql, expectPgError, seedTwoVentures } from "../helpers/db";
let admin: Sql;
let fixture: Awaited<ReturnType<typeof seedTwoVentures>>;
let accountId: string;
let creates = 0;
let checkoutStatus = "open";
let failProvider = false;
const secret = "whsec_local_fixture_not_a_provider_secret";
let snapshot: SubscriptionSnapshot = {
  id: "sub_local_fixture",
  customerId: "cus_local_fixture",
  status: "active",
  priceId: "price_local_fixture",
  amountMinor: 2500,
  currency: "GBP",
  interval: "month",
  intervalCount: 1,
  periodEnd: new Date(Date.now() + 86400000),
  cancelAtPeriodEnd: false,
};
const provider: BillingProvider = {
  async createCustomer() {
    return "cus_local_fixture";
  },
  async createCheckout() {
    creates++;
    checkoutStatus = "open";
    return {
      id: "cs_local_fixture",
      url: "https://checkout.stripe.com/c/local-fixture",
      expiresAt: new Date(Date.now() + 3600000),
    };
  },
  async retrieveCheckout() {
    return {
      id: "cs_local_fixture",
      url: "https://checkout.stripe.com/c/local-fixture",
      status: checkoutStatus,
      expiresAt: new Date(Date.now() + 3600000),
    };
  },
  async createPortal() {
    return "https://billing.stripe.com/p/local-fixture";
  },
  async retrieveSubscription() {
    if (failProvider) throw new Error("fixture failure");
    return snapshot;
  },
};
function event(id: string) {
  const body = JSON.stringify({
    id,
    object: "event",
    type: "customer.subscription.updated",
    data: { object: { id: "sub_local_fixture", customer: "cus_local_fixture", status: "unpaid" } },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({ payload: body, secret });
  return { body, signature };
}
beforeAll(async () => {
  admin = adminSql();
  fixture = await seedTwoVentures(admin);
  accountId = (await listBillingAccounts({ userId: fixture.user.alice }))[0]!.id;
  setBillingProviderForTests(provider);
});
afterAll(async () => {
  setBillingProviderForTests(undefined);
  await closePools();
  await admin.end();
});
describe("billing account ownership and subscription mirror", () => {
  it("provisions separate billing ownership and disabled venture entitlements", async () => {
    const overview = await getBillingOverview({ userId: fixture.user.alice }, accountId);
    expect(overview.subscription).toBeNull();
    expect(overview.entitlements).toHaveLength(1);
    expect(overview.entitlements[0]!.enabled).toBe(false);
    for (const userId of [fixture.user.bob, fixture.user.dave, fixture.user.carol]) {
      await expect(getBillingOverview({ userId }, accountId)).rejects.toThrow("access");
      await expect(
        startBillingCommand({ userId }, { accountId, requestId: randomUUID(), action: "checkout" }),
      ).rejects.toThrow("access");
    }
    expect(creates).toBe(0);
    await expectPgError(
      withUser({ userId: fixture.user.alice }, (tx) =>
        tx.execute(
          sql`update billing_account_members set active = false where billing_account_id = ${accountId}`,
        ),
      ),
      "42501",
    );
  });
  it("reuses checkout and rechecks revoked billing ownership", async () => {
    const actor = { userId: fixture.user.alice };
    const result = await startBillingCommand(actor, {
      accountId,
      requestId: randomUUID(),
      action: "checkout",
    });
    expect(result.url).toMatch(/^https:\/\/checkout.stripe.com\//);
    await startBillingCommand(actor, { accountId, requestId: randomUUID(), action: "checkout" });
    expect(creates).toBe(1);
    await admin`update billing_account_members set active = false where billing_account_id = ${accountId}`;
    await expect(
      startBillingCommand(actor, { accountId, requestId: randomUUID(), action: "portal" }),
    ).rejects.toThrow("access");
    await admin`update billing_account_members set active = true where billing_account_id = ${accountId}`;
  });
  it("requires an explicit account service scope and denies arbitrary entitlement writes", async () => {
    expect(
      await withService({ serviceId: "webhook:stripe" }, (tx) =>
        tx.execute(sql`select * from subscriptions`),
      ),
    ).toHaveLength(0);
    const changed = await withUser({ userId: fixture.user.alice }, (tx) =>
      tx.execute(
        sql`update venture_entitlements set enabled = true where billing_account_id = ${accountId} returning id`,
      ),
    );
    expect(changed).toHaveLength(0);
    expect(
      (await getBillingOverview({ userId: fixture.user.alice }, accountId)).entitlements[0]!
        .enabled,
    ).toBe(false);
  });
  it("validates signatures before mutation, fetches current state and applies a webhook once", async () => {
    checkoutStatus = "complete";
    const e = event("evt_local_first");
    await expect(
      processBillingWebhook(e.body + " ", e.signature, secret, randomUUID()),
    ).rejects.toThrow();
    expect(await processBillingWebhook(e.body, e.signature, secret, randomUUID())).toEqual({
      status: "processed",
    });
    expect(await processBillingWebhook(e.body, e.signature, secret, randomUUID())).toEqual({
      status: "duplicate",
    });
    const overview = await getBillingOverview({ userId: fixture.user.alice }, accountId);
    expect(overview.subscription?.status).toBe("active"); // signed event's stale unpaid status is not used
    expect(overview.entitlements[0]!.enabled).toBe(true);
    expect(
      await admin`select count(*)::int as count from billing_webhook_events where billing_account_id = ${accountId}`,
    ).toEqual([{ count: 1 }]);
    expect(
      await admin`select count(*)::int as count from audit_log where target_id = ${accountId} and action = 'billing.subscription.updated'`,
    ).toEqual([{ count: 1 }]);
    await expect(
      startBillingCommand(
        { userId: fixture.user.alice },
        { accountId, requestId: randomUUID(), action: "checkout" },
      ),
    ).rejects.toThrow("already exists");
  });
  it("rolls back provider failures and permits retry, then disables unpaid entitlements", async () => {
    const e = event("evt_local_retry");
    failProvider = true;
    await expect(
      processBillingWebhook(e.body, e.signature, secret, randomUUID()),
    ).rejects.toThrow();
    expect(
      await admin`select count(*)::int as count from billing_webhook_events where provider_event_id = 'evt_local_retry'`,
    ).toEqual([{ count: 0 }]);
    failProvider = false;
    snapshot = { ...snapshot, status: "unpaid" };
    expect(await processBillingWebhook(e.body, e.signature, secret, randomUUID())).toEqual({
      status: "processed",
    });
    expect(
      (await getBillingOverview({ userId: fixture.user.alice }, accountId)).entitlements[0]!
        .enabled,
    ).toBe(false);
  });
  it("does not accept a provider snapshot for a different routed subscription", async () => {
    const previous = snapshot;
    snapshot = { ...snapshot, id: "sub_other_fixture" };
    const e = event("evt_local_mismatched_subscription");
    await expect(processBillingWebhook(e.body, e.signature, secret, randomUUID())).rejects.toThrow(
      "unavailable",
    );
    expect(
      await admin`select count(*)::int as count from billing_webhook_events where provider_event_id = 'evt_local_mismatched_subscription'`,
    ).toEqual([{ count: 0 }]);
    snapshot = previous;
  });

  it("retires completed checkout references and permits resubscription after cancellation", async () => {
    expect(
      await admin`select checkout_session_id from billing_accounts where id = ${accountId}`,
    ).toEqual([{ checkout_session_id: null }]);
    snapshot = { ...snapshot, status: "canceled" };
    const canceled = event("evt_local_canceled");
    await processBillingWebhook(canceled.body, canceled.signature, secret, randomUUID());
    await startBillingCommand(
      { userId: fixture.user.alice },
      { accountId, requestId: randomUUID(), action: "checkout" },
    );
    expect(creates).toBe(2);
    const repeatedCancellation = event("evt_local_canceled_late");
    await processBillingWebhook(
      repeatedCancellation.body,
      repeatedCancellation.signature,
      secret,
      randomUUID(),
    );
    // A late cancellation event must not retire the new still-open checkout.
    await startBillingCommand(
      { userId: fixture.user.alice },
      { accountId, requestId: randomUUID(), action: "checkout" },
    );
    expect(creates).toBe(2);
  });
});
