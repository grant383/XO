# ADR-0008 — Account-level audit events

- Status: Accepted (decision D5)
- Date: 2026-10-03

## Context
Spec §16 requires `venture_id NOT NULL` on venture-owned entities, but security events such as login, logout, password reset, MFA changes, session revocation and billing-account activity have no venture.

## Decision
`audit_log.venture_id` is nullable. Rows with `venture_id IS NULL` are account-level events.

- Insert (`dxo_app`): the recorded actor must equal the transaction's actor (user or service identity); venture rows must belong to the active venture context.
- Insert (`dxo_auth`): account-level rows only (`venture_id IS NULL`), including anonymous events such as failed logins for unknown emails.
- Read: venture rows by Owner/Admin of the active venture; account rows by the user who is their subject or actor. Billing-account rows will be readable by billing-account members (added with `billing_accounts`, ADR-0011).
- Append-only: no UPDATE/DELETE grants to any runtime role, and triggers reject UPDATE, DELETE and TRUNCATE for every role.
- User and venture references are not foreign keys so evidence survives deletion of the referenced records.

## Consequences
The RLS catalogue test exempts `audit_log` from the NOT NULL `venture_id` rule; no other table may be exempted without a new ADR.
