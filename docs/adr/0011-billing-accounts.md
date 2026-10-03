# ADR-0011 — Billing accounts separate from venture ownership

- Status: Accepted (decision D4); implementation in P0 step 8
- Date: 2026-10-03

## Decision
SaaS billing is modelled independently of the venture Owner role:
- `billing_accounts` — the paying entity (Stripe customer).
- `billing_account_members` — users who can manage a billing account.
- `subscriptions` — Stripe subscription state per billing account.
- `venture_entitlements` — which ventures a billing account entitles.

A billing account may entitle one or more ventures. The creator of a venture initially becomes both billing-account owner and venture Owner, but these remain separate records. `/settings/billing` authorizes against billing-account membership, not venture role.
