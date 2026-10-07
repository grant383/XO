import { randomUUID } from "node:crypto";
import postgres from "postgres";

/**
 * Synthetic subscription mirror rows for E2E only. A provider-confirmed subscription can only
 * be produced by a signed Stripe webhook plus a live provider read, and live Stripe is a
 * deferred external gate (ADR-0019/0020). These fixtures write the mirror the webhook would
 * write, through the local admin connection, so the page's real authentication, billing
 * ownership, RLS and rendering paths are exercised unchanged. Never used outside local/CI.
 */
const ADMIN_URL =
  process.env.ADMIN_DATABASE_URL ??
  "postgresql://dxo_admin:local-admin-password@localhost:54329/directorxo";

export type MirrorState = {
  status:
    | "active"
    | "trialing"
    | "past_due"
    | "unpaid"
    | "incomplete"
    | "paused"
    | "canceled"
    | "incomplete_expired";
  cancelAtPeriodEnd?: boolean;
};

export async function mirrorSubscription(accountId: string, state: MirrorState) {
  const sql = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      await tx`update billing_accounts set stripe_customer_id = coalesce(stripe_customer_id, ${`cus_e2e_${randomUUID().slice(0, 12)}`}) where id = ${accountId}`;
      await tx`
        insert into subscriptions (billing_account_id, stripe_subscription_id, status, price_id,
          amount_minor, currency, interval, interval_count, period_end, cancel_at_period_end)
        values (${accountId}, ${`sub_e2e_${randomUUID().slice(0, 12)}`}, ${state.status},
          'price_e2e_synthetic', 14900, 'GBP', 'month', 1, '2026-11-03T00:00:00Z',
          ${state.cancelAtPeriodEnd ?? false})
        on conflict (billing_account_id) do update set status = excluded.status,
          cancel_at_period_end = excluded.cancel_at_period_end, synced_at = now(),
          updated_at = now()`;
      await tx`update venture_entitlements set enabled = ${["active", "trialing"].includes(state.status)}, updated_at = now() where billing_account_id = ${accountId}`;
    });
  } finally {
    await sql.end();
  }
}
