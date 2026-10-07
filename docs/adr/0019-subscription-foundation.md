# ADR-0019 — Local subscription billing foundation

- Status: Accepted; real provider/release verification outstanding
- Date: 2026-10-07

## Decision

Implement ADR-0011 with separate billing accounts, explicit active Owner memberships, a provider-confirmed subscription mirror, and venture entitlements. Venture creation provisions the creator's account/membership and an explicit entitlement in the same transaction; existing ventures are backfilled once. Billing ownership does not grant venture permissions. The account route and API authorize against billing ownership, not venture roles. FORCE RLS independently restricts reads and writes. Account-scoped service transactions cannot read other accounts; entitlements additionally require venture access for user reads.

The official Stripe SDK is behind a stable adapter with bounded timeout/retries, a pinned `2025-02-24.acacia` response contract and runtime validation. The server chooses the stored customer and explicitly configured recurring Price ID. No price, payment details, invoice rows or usage quota are fabricated. Unset configuration disables payment actions and returns a machine-readable 503. The approved screen's overview/payment/invoice/cancellation structure uses existing tokens and account shell; invoices, payment details, plan changes and cancellation are handled by the hosted billing portal. Full inline invoice/payment/usage presentation and real provider verification remain outstanding; the Figma row stays VERIFY.

Commands use request UUIDs, stable customer idempotency and a per-account transaction lock. The mutation transaction rechecks/locks active billing ownership before calling Stripe. An existing open checkout is reused; an active subscription or completed checkout blocks duplicate subscription creation. Completed/expired checkout references are retired only after provider confirmation, allowing resubscription after cancellation without discarding a newly opened checkout on a late old cancellation event. Secure session URLs are validated against Stripe hosts and returned for explicit user navigation. They are not stored or logged.

Webhooks use the untouched bounded body, the SDK's signature verifier and a five-minute replay tolerance including a future-timestamp check. Only supported snapshot subscription/checkout events route by stored customer. The handler fetches current provider state rather than trusting stale event status/amount. Account locking, unique receipt, subscription mirror, entitlement update and audit commit atomically. Failure rolls back and returns 503 for provider retry. Older events from replaced subscriptions cannot overwrite a current active subscription. A checkout return URL never activates billing.

Active/trialing subscriptions enable the linked entitlement mirror; past_due, unpaid, canceled, incomplete and paused disable it. This is a subscription entitlement record, not an authorization bypass. No P1 operational route or venture role is inferred from it. New ventures remain explicitly linked to the creator's billable account.

## Verification and recovery

Synthetic SDK, signature, routing-boundary and database/RLS tests are local evidence only. No DirectorXO Stripe recurring price is approved, no Railway resources exist and no provider resources have been created. Billing is not certified complete.

Migration 0012 is additive. Rollback retains accounts, mirror state and idempotent receipts; do not delete financial/audit records. Recover data under the separate release/recovery runbook. Real test-mode checkout, portal configuration, webhook delivery/retries and production recovery remain P0 gates.

## Contract references

- [Stripe subscription Checkout](https://docs.stripe.com/api/checkout/sessions/create)
- [Pinned subscription retrieval contract](https://docs.stripe.com/api/subscriptions/retrieve?api-version=2025-02-24.acacia)
- [Webhook signature and retry guidance](https://docs.stripe.com/webhooks)
