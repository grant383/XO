# Claude Code Instructions — DirectorXO

Read `DIRECTORXO_PRODUCT_SPEC.md` completely before making architectural or product changes.

## Source-of-truth precedence

1. `DIRECTORXO_PRODUCT_SPEC.md` — architecture, routes, tenancy, RBAC, RLS, data model, APIs, integrations, forecasting rules, phases, acceptance criteria.
2. `DIRECTORXO_IMPLEMENTATION_MATRIX.md` — the 60 approved capabilities with canonical route, Figma node, module, permission, authorization boundary, test requirement and current status. Keep it updated with every capability change.
3. Approved DirectorXO Figma — layout, spacing, typography, visual hierarchy, responsive behavior, interaction patterns. Figma labels that differ from the spec or matrix are design-sync items, not implementation requirements.
4. ADRs (`docs/adr/`, indexed in `docs/ARCHITECTURE_DECISIONS.md`) — recorded architecture and security decisions.
5. Existing implementation — follow only where it does not conflict with the sources above.

## Build discipline

Work in phase order. Start with P0 Foundation only. Do not begin a later phase until current phase exit criteria pass.

Before coding:
- inspect repository structure and dependencies;
- compare current code against the relevant phase requirements;
- produce a short implementation plan;
- identify conflicts explicitly rather than silently changing the specification.

For every significant change:
- add/update tests;
- run relevant tests;
- fix failures before continuing;
- keep commits focused and descriptive;
- do not weaken security or tenancy controls to make tests pass.

## Non-negotiable architecture

- Modular monolith first.
- PostgreSQL is the system of record.
- Every venture-owned entity is scoped by `venture_id` where required by the specification.
- PostgreSQL RLS must independently enforce tenant isolation.
- API authorization is authoritative; UI hiding is not authorization.
- Background jobs must execute with explicit venture/service identity.
- Webhooks and imports must be idempotent.
- Material mutations must be auditable.
- Integration/provider code must sit behind stable adapters.
- No secrets in source control.

## Release 1 intelligence rules

Do not introduce LSTM, XGBoost, neural networks, Kafka, Feast, service mesh, Kubernetes, or premature microservices for Release 1.

Forecasting must remain deterministic/statistical and explainable. Inputs, assumptions, source freshness, calculation version and evidence must be traceable.

## Definition of done

A screen or capability is not complete until applicable requirements in the product specification pass, including:
- canonical route;
- approved Figma match;
- responsive states;
- loading/empty/error/unauthorized/stale states;
- server-side permission checks;
- RLS coverage and cross-venture tests;
- audit behavior;
- validation;
- accessibility;
- unit/integration/E2E tests;
- observability where production-critical.

## First implementation target

**Step numbering:** the current P0 execution-step numbering takes precedence over the older numbered checklist below. Steps 1–4 (tooling/CI, database roles and RLS, authentication/sessions/email/rate limiting, venture lifecycle/onboarding/switching) and Step 5 (memberships, RBAC, invitations, access requests) are complete. **Step 6 = MFA, recovery, session/device management.** References such as "step 6" in ADRs and the implementation matrix use the execution numbering.

P0 Foundation (original checklist; scope reference only, not execution order):
1. application shell/design foundations;
2. authentication/account creation;
3. email verification/password recovery;
4. venture creation/onboarding/switching;
5. RLS and tenancy tests;
6. RBAC/team invitations;
7. profile/security/MFA/session foundations;
8. audit and notification foundations;
9. billing/subscription foundation;
10. error states;
11. CI/CD, environments, secrets, observability, backup/recovery foundations.

Do not start P1 until the P0 exit criteria in `DIRECTORXO_PRODUCT_SPEC.md` pass.
