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
