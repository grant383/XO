# ADR-0020 — Hosted billing portal for P0 payment methods and invoices

- Status: Accepted
- Date: 2026-10-07

## Context

The approved Billing & Subscription frame (Figma 33:4087) shows a current-plan card with price and renewal, a plan-usage card (team seats, connected sources, AI analysis credits), an inline payment-method card, an inline invoice-history table with downloads, a settings sub-navigation and a cancellation action. ADR-0019 implemented the subscription mirror and left inline invoice, payment-method and usage presentation open. No DirectorXO recurring Stripe price is approved and live Stripe configuration is a deferred external gate, so inline payment and invoice data could not be verified against a real provider.

## Decision

In P0, `/settings/billing` shows the provider-confirmed subscription mirror (plan amount, interval, status, period end or cancellation, last sync time) and the venture entitlements it controls. Payment methods, invoice history and download, plan changes and cancellation are handled in the Stripe-hosted billing portal and reached through the existing server-chosen, Owner-rechecked portal command (ADR-0019). DirectorXO does not store, render or proxy card details or invoice documents in P0.

- Status labels and consequences come from one tested presenter (`presentSubscription`): Active, Trial, Past due, Unpaid, Incomplete, Paused, Canceled and Expired. Non-entitling states say plainly that linked ventures are not enabled. Only active and trialing subscriptions enable entitlements.
- Ended subscriptions (canceled, expired) offer a new checkout. Every other state is managed in the portal.
- No prices, invoices, payment methods or usage figures are fabricated. With no provider configured, every provider action is disabled and the page says so.
- The plan-usage card is not built. Connected sources depend on P1 integrations and AI analysis credits on P2 intelligence, so P0 cannot show them truthfully. Team seats are not a billed quantity under the single approved recurring price. This is design-sync item 26.
- The settings sub-navigation remains design-sync item 22.

## Alternatives considered

- Inline payment method and invoice table through the adapter (`customers.retrieve`, `invoices.list`). Rejected for P0: it adds provider reads, PCI-adjacent presentation and caching/freshness rules that cannot be verified without live Stripe, while the hosted portal already provides them securely.
- Fixture-only inline invoices. Rejected: fixture data shown as real invoices would mislead users.

## Consequences

Users leave DirectorXO to see invoices or change a card. The Figma frame's inline sections are design-sync items, not P0 implementation gaps. E2E covers every mirrored status on desktop and mobile with synthetic mirror rows (`tests/e2e/billing.spec.ts`), and unit tests cover the presenter. Real checkout, portal configuration, webhook delivery and retries remain a deferred external gate (ADR-0019).

Inline invoice and payment presentation can be added later behind the same adapter without schema changes. No migration is involved, so rollback is an application rollback only.
