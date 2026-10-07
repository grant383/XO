# DirectorXO Architecture Decisions

Use this file as the index for Architecture Decision Records (ADRs). Significant departures from `DIRECTORXO_PRODUCT_SPEC.md` must be recorded rather than introduced silently.

## ADR format

Create files under `docs/adr/` using:

`NNNN-short-title.md`

Each ADR should contain:
- Status
- Date
- Context
- Decision
- Alternatives considered
- Consequences
- Migration/rollback notes where applicable

## Initial locked decisions

### ADR-0001 — Modular monolith first
Status: Accepted

DirectorXO starts as a modular monolith. Service extraction requires operational evidence such as scaling, ownership, isolation or deployment constraints.

### ADR-0002 — PostgreSQL RLS for tenant isolation
Status: Accepted

Venture-owned records are protected by PostgreSQL row-level security in addition to application-layer authorization. Cross-venture isolation must be covered by automated tests.

### ADR-0003 — Deterministic forecasting before ML
Status: Accepted

Release 1 uses explicit formulas and statistical methods. Learned models belong only to the later ML Data Maturity phase after entry criteria in the product specification are satisfied.

### ADR-0004 — Figma and product spec precedence
Status: Accepted

`DIRECTORXO_PRODUCT_SPEC.md` governs product/technical behavior. Approved Figma governs visual and interaction implementation. Conflicts are resolved explicitly and documented.

## Recorded ADRs (`docs/adr/`)

| ADR | Title | Status |
|---|---|---|
| [0005](adr/0005-runtime-and-toolchain-versions.md) | Runtime and toolchain versions | Accepted |
| [0006](adr/0006-modular-monolith-layout.md) | Modular monolith code layout | Accepted |
| [0007](adr/0007-database-roles-and-rls.md) | Database roles, tenant context and RLS | Accepted |
| [0008](adr/0008-account-level-audit-events.md) | Account-level audit events | Accepted |
| [0009](adr/0009-authentication-better-auth.md) | Authentication with Better Auth | Accepted |
| [0010](adr/0010-hosting-railway.md) | Hosting on Railway; RPO/RTO | Accepted |
| [0011](adr/0011-billing-accounts.md) | Billing accounts separate from venture ownership | Accepted |
| [0013](adr/0013-memberships-rbac-invitations.md) | Memberships, RBAC, invitations and access requests | Accepted |
| [0014](adr/0014-ui-foundations-design-tokens.md) | UI foundations: design tokens, components and E2E | Accepted |
| [0015](adr/0015-app-shell-error-states-journey-e2e.md) | Application shell, error states and journey E2E | Accepted |
| [0016](adr/0016-mfa-recovery-session-management.md) | MFA, account recovery and session/device management | Accepted |
| [0017](adr/0017-account-support.md) | Account support requests | Accepted |
| [0018](adr/0018-account-notifications.md) | Account notifications and venture activity | Accepted |
| [0019](adr/0019-subscription-foundation.md) | Local subscription billing foundation | Accepted; provider verification open |
| [0020](adr/0020-billing-hosted-portal.md) | Hosted billing portal for P0 payment methods and invoices | Accepted |
| [0021](adr/0021-p0-server-action-contracts.md) | Server-action contracts for P0 venture, onboarding and membership APIs | Accepted |
| [0022](adr/0022-technical-specifications-in-docs.md) | Technical specifications live in version-controlled docs | Accepted |
| [0023](adr/0023-email-outbox-worker.md) | Identity email outbox and worker (BullMQ) | Accepted |
| [0024](adr/0024-command-centre.md) | Command Centre: tasks, deterministic signals, no placeholder metrics | Accepted |
