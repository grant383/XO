import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { z } from "zod";
import {
  billingIntervalLabel,
  formatBillingAmount,
  BillingPermissionError,
  presentSubscription,
  getBillingOverview,
  listBillingAccounts,
} from "@/modules/billing";
import { Button, EmptyState, SelectField, StatusBadge } from "@/ui";
import { requireActor } from "../../actor";
import { ForbiddenState } from "../../_chrome/error-states";
import { PageHeader, PageContent } from "../../_shell/page-header";
import { BillingButton } from "./billing-button";
import styles from "./billing.module.css";
export const metadata: Metadata = { title: "Billing and subscription" };
export const dynamic = "force-dynamic";

const periodFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });
const syncedFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/**
 * Billing & Subscription (Figma 33:4087). Plan state comes from the provider-confirmed
 * mirror; payment methods, invoices, plan changes and cancellation are handled in the
 * Stripe-hosted billing portal in P0 (ADR-0020).
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; checkout?: string }>;
}) {
  const actor = await requireActor("/settings/billing");
  const params = await searchParams;
  const accounts = await listBillingAccounts(actor);
  const accountId = params.accountId ?? accounts[0]?.id;
  if (!accountId || !z.uuid().safeParse(accountId).success)
    return (
      <ForbiddenState
        title="Billing ownership required"
        description="This page is available to billing account owners."
      />
    );
  let overview;
  try {
    overview = await getBillingOverview(actor, accountId);
  } catch (error) {
    if (error instanceof BillingPermissionError)
      return (
        <ForbiddenState
          title="Billing ownership required"
          description="This page is available to billing account owners."
        />
      );
    throw error;
  }
  const { account, subscription, entitlements, configured } = overview;
  const presentation = subscription ? presentSubscription(subscription.status) : null;
  const subscribed = presentation?.subscribed ?? false;
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Account" }, { label: "Billing & Subscription" }]}
        title="Billing & Subscription"
        actions={
          <BillingButton
            requestId={randomUUID()}
            accountId={account.id}
            action={subscribed ? "portal" : "checkout"}
            disabled={!configured}
          >
            {subscribed ? "Manage plan" : "Start subscription"}
          </BillingButton>
        }
      >
        Manage your plan, payment method, and invoices
      </PageHeader>
      <PageContent>
        <div className={styles.stack}>
          {accounts.length > 1 ? (
            <form action="/settings/billing" className={styles.selection}>
              <SelectField
                label="Billing account"
                name="accountId"
                defaultValue={account.id}
                options={accounts.map((a) => ({ value: a.id, label: a.name }))}
              />
              <Button type="submit" variant="secondary">
                View account
              </Button>
            </form>
          ) : null}
          {!configured ? (
            <p role="status" className={styles.notice}>
              Subscription billing is not configured. Checkout and billing management are
              unavailable.
            </p>
          ) : null}
          {params.checkout === "complete" ? (
            <p role="status">
              Checkout returned. Subscription status updates after payment confirmation; this return
              does not activate a subscription.
            </p>
          ) : null}
          <div className={styles.columns}>
            <section className={styles.card}>
              <div className={styles.heading}>
                <span className={styles.label}>Current plan</span>
                {presentation ? (
                  <StatusBadge tone={presentation.tone}>{presentation.label}</StatusBadge>
                ) : null}
              </div>
              <h2>{subscription ? "DirectorXO subscription" : "No subscription"}</h2>
              {subscription ? (
                <>
                  <p className={styles.price}>
                    {formatBillingAmount(subscription.amountMinor, subscription.currency)}
                    <span>
                      {" "}
                      {billingIntervalLabel(subscription.interval, subscription.intervalCount)}
                    </span>
                  </p>
                  <p>Provider-confirmed subscription for {account.name}.</p>
                  {presentation?.notice ? (
                    <p role="status" className={styles.notice}>
                      {presentation.notice}
                    </p>
                  ) : null}
                  <dl>
                    <dt>
                      {!subscribed
                        ? "Ended"
                        : subscription.cancelAtPeriodEnd
                          ? "Ends at period close"
                          : "Current period ends"}
                    </dt>
                    <dd>{periodFormat.format(subscription.periodEnd)}</dd>
                    <dt>Last synced</dt>
                    <dd>{syncedFormat.format(subscription.syncedAt)} UTC</dd>
                  </dl>
                </>
              ) : (
                <p>No subscription is attached to this billing account.</p>
              )}
            </section>
            <section className={styles.card}>
              <span className={styles.label}>Venture entitlements</span>
              <h2>Linked ventures</h2>
              {entitlements.length ? (
                <ul className={styles.ventures}>
                  {entitlements.map((v) => (
                    <li key={v.ventureId}>
                      <span>{v.name}</span>
                      <StatusBadge tone={v.enabled ? "success" : "neutral"}>
                        {v.enabled ? "Enabled" : "Not enabled"}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No visible linked ventures" />
              )}
              <p>Subscription entitlements do not grant venture membership or permissions.</p>
            </section>
          </div>
          <section className={styles.card}>
            <div className={styles.heading}>
              <div>
                <h2>Payment method</h2>
                <p>Manage recurring subscription payments securely with Stripe.</p>
              </div>
              <BillingButton
                requestId={randomUUID()}
                accountId={account.id}
                action="portal"
                disabled={!configured || !account.hasCustomer}
              >
                Update payment method
              </BillingButton>
            </div>
            <div className={styles.inset}>
              Payment details are available in the secure billing portal.
            </div>
          </section>
          <section className={styles.card}>
            <h2>Invoice history</h2>
            <p>View and download your subscription invoices in the secure billing portal.</p>
            <BillingButton
              requestId={randomUUID()}
              accountId={account.id}
              action="portal"
              disabled={!configured || !account.hasCustomer}
            >
              View invoices
            </BillingButton>
          </section>
          <section className={styles.heading}>
            <div>
              <h2>Cancel subscription</h2>
              <p>Review cancellation and the effective date in Stripe before confirming.</p>
            </div>
            <BillingButton
              requestId={randomUUID()}
              accountId={account.id}
              action="portal"
              disabled={!configured || !account.hasCustomer}
            >
              Review cancellation
            </BillingButton>
          </section>
        </div>
      </PageContent>
    </>
  );
}
