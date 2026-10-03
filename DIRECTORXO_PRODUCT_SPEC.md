# DirectorXO Product Specification

## 1. Executive Summary

DirectorXO is a multi-tenant business operating system for founders, operators, and venture portfolios. It combines business health monitoring, strategy, planning, operational execution, forecasting, risk management, and cross-venture analysis.

The canonical product hierarchy is:

- **Command** — business health and the £1M Growth Command.
- **Build** — strategy, plans, targets, and systems.
- **Operate** — CRM, finance, sales, scheduling, team, and assets.
- **Intelligence** — forecasts, risks, recommendations, and decisions.
- **Portfolio** — multiple ventures and cross-venture analysis.

Release 1 forecasting must use transparent deterministic and statistical methods. It must not prescribe or depend on LSTM, XGBoost, neural networks, or other machine-learning models. ML belongs exclusively to the later P4 ML Data Maturity phase after sufficient governed historical data exists.

The initial implementation should use a modular monolith built with Next.js and TypeScript, PostgreSQL with row-level security, Redis/BullMQ for background jobs, S3-compatible object storage, and REST APIs. Python/FastAPI may be introduced later only for workloads that justify a separate service.

## 2. Goals

- Provide a canonical source of truth for venture health, plans, operations, forecasts, and risks.
- Turn operational data into explainable forecasts and recommendations.
- Support a founder operating one venture and an owner overseeing a portfolio.
- Maintain strict tenant isolation through `venture_id` and PostgreSQL RLS.
- Integrate with core finance, payments, communications, scheduling, advertising, mapping, and company-data providers.
- Ship incrementally without requiring premature microservices or ML infrastructure.
- Ensure every forecast and recommendation is reproducible and auditable.

## 3. Non-Goals for Release 1

- LSTM, XGBoost, neural-network, or other learned forecasting models.
- Autonomous decisions or irreversible actions without user confirmation.
- A general-purpose accounting ledger replacing Xero.
- A general-purpose payroll or HRIS platform.
- Arbitrary workflow automation comparable to Zapier.
- Microservice decomposition before clear scaling or ownership boundaries exist.
- Cross-tenant training or data sharing.
- Portfolio access that bypasses venture-level authorization.

## 4. Canonical Information Architecture

```text
DirectorXO
├── Auth and Onboarding
│   ├── Login
│   ├── Password recovery
│   ├── Account creation
│   ├── Email verification
│   └── Venture setup and data connection
├── Command
│   ├── Command Centre
│   └── £1M Growth Command
├── Build
├── Operate
├── Intelligence
└── Portfolio
```

## 5. Canonical Route Conventions

- Auth routes use `/auth/*`.
- Initial venture setup uses `/onboarding/*`.
- Venture-scoped product routes use `/v/[ventureId]/*`.
- Portfolio routes use `/portfolio/*`.
- Account-level settings use `/settings/*`.
- Venture integrations use `/v/[ventureId]/settings/integrations`.
- Error routes use `/errors/*`.
- Technical documentation routes use `/internal/specs/*` and must not be exposed as customer navigation.
- IDs in URLs are opaque UUIDs.
- The active venture is explicit in the route and authorization context.
- Legacy routes redirect to canonical replacements where safe.

## 6. Release Principles

### Deterministic before predictive
Release 1 forecasts use explicit formulas, statistical summaries, configurable assumptions, and traceable source records.

### Explain every output
Forecasts, risks, and recommendations must expose inputs, assumptions, calculation version, and generation time.

### Modular monolith first
Domain boundaries exist in code and data, but deployment remains unified until operational evidence justifies separation.

### Tenant isolation by default
Every venture-owned record includes `venture_id`; PostgreSQL RLS is mandatory and covered by automated tests.

### Least privilege
Authorization is enforced server-side through role and permission checks, never solely through UI visibility.

### Integrations are adapters
Provider-specific logic remains behind stable domain interfaces.

### Idempotent synchronization
Webhooks, imports, and background jobs tolerate retries and duplicate provider events.

### Auditable mutations
Material changes to finance, permissions, assumptions, forecasts, risks, and recommendations generate audit records.

### Human-controlled decisions
Recommendations may propose actions, but users approve consequential changes.

### Accessible and responsive
Core workflows support keyboard navigation, WCAG 2.2 AA contrast, desktop, tablet, and mobile layouts.

## 7. Roles and Minimum-Permission Semantics

| Role | Default scope |
|---|---|
| Owner | Full venture control, billing, integrations, team, deletion, ownership transfer |
| Admin | Full operational administration except ownership transfer and owner-only billing actions |
| Manager | Read/write access to assigned operational and planning domains |
| Operator | Day-to-day record creation and updates in assigned domains |
| Viewer | Read-only access to permitted venture data |

Matrix notation:

- Public — no authenticated session required.
- Authenticated — any authenticated user.
- Viewer+ — Viewer, Operator, Manager, Admin, or Owner.
- Operator+ — Operator, Manager, Admin, or Owner.
- Manager+ — Manager, Admin, or Owner.
- Admin+ — Admin or Owner.
- Owner — venture owner only.
- Portfolio access additionally requires explicit portfolio membership.

## 8. Definitive Product Screen Matrix

| Figma node | Product screen | Canonical route | Module | Minimum permission | Phase |
|---|---|---|---|---|---|
| 31:3441 | DirectorXO login | `/auth/login` | Auth | Public | P0 |
| 31:3549 | Login error | `/auth/login/error` | Auth | Public | P0 |
| 31:3503 | Forgot password | `/auth/forgot-password` | Auth | Public | P0 |
| 33:3315 | Set new password | `/auth/reset-password` | Auth | Public with valid token | P0 |
| 33:3202 | Create account | `/auth/register` | Auth | Public | P0 |
| 33:3266 | Verify email | `/auth/verify-email` | Auth | Public with valid token | P0 |
| 33:3378 | Business setup onboarding | `/onboarding/business` | Onboarding | Authenticated | P0 |
| 33:3447 | Connect business data onboarding | `/onboarding/data-connections` | Onboarding | Owner | P0 |
| 39:164 | Review and confirm onboarding | `/onboarding/review` | Onboarding | Owner | P0 |
| 8:651 | Command Centre | `/v/[ventureId]/command` | Command | Viewer+ | P1 |
| 29:1087 | £1M Growth Command | `/v/[ventureId]/command/growth-1m` | Command | Viewer+ | P1 |
| 3:255 | DirectorXO dashboard | legacy redirect to Command | Legacy | Viewer+ | Deprecated |
| 10:847 | Idea Lab | `/v/[ventureId]/build/ideas` | Build | Operator+ | P2 |
| 10:1429 | Market Research | `/v/[ventureId]/build/market-research` | Build | Operator+ | P2 |
| 10:4668 | Goal Architect | `/v/[ventureId]/build/goals` | Build | Manager+ | P2 |
| 8:264 | Reverse Blueprint | `/v/[ventureId]/build/reverse-blueprint` | Build | Manager+ | P2 |
| 8:849 | Launch Control | `/v/[ventureId]/build/launch-control` | Build | Operator+ | P2 |
| 8:1094 | Funding Waterfall | `/v/[ventureId]/build/funding-waterfall` | Build | Manager+ | P2 |
| 8:1479 | Financial Model P&L | `/v/[ventureId]/build/financial-model` | Build | Manager+ | P2 |
| 10:4 | Marketing Plan | `/v/[ventureId]/build/marketing` | Build | Manager+ | P2 |
| 10:257 | Sales Plan | `/v/[ventureId]/build/sales` | Build | Manager+ | P2 |
| 10:530 | Operations and Team | `/v/[ventureId]/build/operations-team` | Build | Manager+ | P2 |
| 10:1109 | Risk Register | `/v/[ventureId]/build/risks` | Build | Operator+ | P2 |
| 10:1703 | Compliance and Legal | `/v/[ventureId]/build/compliance` | Build | Manager+ | P2 |
| 10:2067 | Assets and Equipment | `/v/[ventureId]/build/assets` | Build | Operator+ | P2 |
| 10:2366 | Systems and Technology | `/v/[ventureId]/build/systems` | Build | Manager+ | P2 |
| 10:2842 | People and HR | `/v/[ventureId]/build/people` | Build | Manager+ | P2 |
| 10:3179 | Operate Finance | `/v/[ventureId]/operate/finance` | Operate | Viewer+ | P1 |
| 10:3462 | Operate Operations | `/v/[ventureId]/operate/operations` | Operate | Operator+ | P1 |
| 10:3734 | Operate Growth | `/v/[ventureId]/operate/growth` | Operate | Operator+ | P1 |
| 10:4344 | Operate Technology | `/v/[ventureId]/operate/technology` | Operate | Operator+ | P1 |
| 14:4 | Client CRM | `/v/[ventureId]/operate/crm` | Operate | Operator+ | P1 |
| 14:438 | Scheduling Calendar | `/v/[ventureId]/operate/schedule` | Operate | Operator+ | P1 |
| 14:740 | Quoting and Invoicing | `/v/[ventureId]/operate/billing` | Operate | Operator+ | P1 |
| 14:1060 | Forecast vs Actual | `/v/[ventureId]/operate/forecast-vs-actual` | Operate | Viewer+ | P1 |
| 14:1766 | AI Copilot | `/v/[ventureId]/intelligence/copilot` | Intelligence | Viewer+ | P2 |
| 8:1303 | Portfolio Command | `/portfolio/command` | Portfolio | Portfolio Viewer+ | P3 |
| 10:3942 | Venture Pipeline | `/portfolio/ventures` | Portfolio | Portfolio Manager+ | P3 |
| 10:4165 | Capital Allocation | `/portfolio/capital-allocation` | Portfolio | Portfolio Manager+ | P3 |
| 33:3534 | Profile and Security | `/settings/profile-security` | System | Authenticated | P0 |
| 33:3712 | Team and Permissions | `/v/[ventureId]/settings/team` | System | Admin+ | P0 |
| 33:3910 | Notifications and Activity | `/settings/notifications-activity` | System | Authenticated | P0 |
| 33:4087 | Billing and Subscription | `/settings/billing` | System | Owner | P0 |
| 33:4290 | Help and Support | `/support` | System | Authenticated | P0 |
| 14:1443 | Settings Integrations | `/v/[ventureId]/settings/integrations` | System | Admin+ | P1 |
| 31:3604 | 404 | `/errors/404` | State | Public | P0 |
| 33:4456 | 403 | `/errors/403` | State | Public | P0 |
| 31:3692 | 500 | `/errors/500` | State | Public | P0 |
| 31:3787 | Empty Growth | growth empty state | State | Viewer+ | P1 |
| 31:3892 | Offline Growth | growth offline state | State | Viewer+ | P1 |

## 9. Technical Specification Frame Matrix

| Figma node | Technical specification | Internal route | Scope | Phase |
|---|---|---|---|---|
| 19:4 | System architecture | `/internal/specs/system-architecture` | Runtime topology, modules, boundaries, request flow | P0 |
| 19:205 | Intelligence architecture | `/internal/specs/intelligence-architecture` | Deterministic forecasts, rules, recommendations, decisions, later ML boundary | P2 |
| 19:614 | Data model | `/internal/specs/data-model` | Entities, tenancy, RLS, indexes, retention | P0 |
| 19:1684 | API integrations | `/internal/specs/api-integrations` | Provider adapters, OAuth, webhooks, synchronization | P1 |
| 19:2078 | Infrastructure security | `/internal/specs/infrastructure-security` | Identity, secrets, encryption, RLS, logging, backup, recovery | P0 |
| 19:2323 | Development roadmap | `/internal/specs/development-roadmap` | P0–P4 sequencing, dependencies, release gates | P0 |

## 10. Legacy and Deprecated Decisions

Figma node `3:255` is legacy and deprecated. It must not receive new feature development. Its canonical replacement is Command Centre node `8:651`.

Existing `/dashboard` and equivalent legacy links should redirect to `/v/[ventureId]/command`.

### AI and ML terminology

The AI Copilot screen name does not authorize ML forecasting in Release 1. In P2, Copilot is an explainable intelligence interface over deterministic calculations, statistical summaries, rules, risks, recommendations, and cited venture data.

### Build versus Operate

- Build screens define desired future state, targets, plans, assumptions, and systems.
- Operate screens manage live records, execution, transactions, and actual performance.
- Build Sales must not become a duplicate CRM.
- Build Marketing must not become a duplicate campaign execution dashboard.
- Build Assets defines requirements; Operate manages live assets and usage.

## 11. Contradictions and Decisions

- AI engine versus release forecasting: P2 is deterministic/statistical orchestration; trained models are P4 only.
- Sales Pipeline naming: use **Sales Plan** for Build; live opportunities stay in Operate.
- Marketing Dashboard: treat Build as marketing planning and targets; live campaigns remain under Operate Growth.
- Operations and Team versus People and HR: operating structure vs workforce/hiring/policy.
- Build Assets versus Operate: requirements/acquisition planning vs live asset records/maintenance/availability.
- Recommendation workflow must include status, evidence, proposed action, reviewer, decision, and audit fields.
- Portfolio authorization requires portfolio memberships without bypassing venture RLS.
- Viewer access may be restricted further with domain-specific overrides for sensitive finance.
- P1 offline support defaults to read-only cached state.
- Billing uses one billable account with explicit venture entitlements.
- Forecast inputs require source classification and reconciliation to prevent double counting.
- Monthly periods are canonical; weekly projections are allowed where supported.
- Store source currency and normalized reporting currency with dated FX rates.
- Confirm the supported Next.js version during P0 and record upgrades via ADR.

## 12. Missing-Screen Backlog

### P0 Required
- Global application shell and venture switcher.
- Accept team invitation.
- MFA setup and recovery.
- Session and device management.
- Venture creation and switching.
- Permission-denied request-access flow.

### P1 Required
- Integration OAuth callback.
- Integration connection detail and sync log.
- Client detail.
- Contact detail.
- Opportunity detail.
- Quote editor/detail.
- Invoice detail.
- Job detail.
- Team member detail and availability.
- Asset detail and maintenance.

### P2 Required
- Forecast assumptions editor.
- Forecast detail and explanation.
- Recommendation detail and decision.
- Risk detail and mitigation workflow.
- Scenario comparison.

### P3 Required
- Portfolio creation and membership.
- Portfolio venture detail.
- Capital allocation scenario detail.
- Data export and deletion.

### P4 Future
- Model monitoring and comparison.
- Data quality and training readiness.

## 13. Deterministic Forecasting Specification

### 13.1 Required inputs

Forecasting supports historical revenue, invoices, transactions, open invoices, pipeline amount/stage/probability/close date, lead volume, conversion, average value, repeat rate, active clients, contracted revenue, capacity, utilization, seasonality, working days, churn/cancellation/refund/bad debt, scenario assumptions, data freshness, and manual overrides.

Every input retains source, source record or aggregate reference, effective date, currency, timestamp, data-quality classification, override status, and author where manually supplied.

### 13.2 Canonical period

Monthly periods are canonical for financial forecasting. Weekly periods may support short-term operational views. Standard horizons are 3, 6, 12, and 24 months.

### 13.3 Historical baseline

```text
simple_baseline_t = sum(revenue[t-i] for i = 1..n) / n

weighted_baseline_t =
  sum(weight[i] * revenue[t-i] for i = 1..n)
  / sum(weight[i] for i = 1..n)
```

Weights are configured and versioned, never implicitly learned in Release 1.

### 13.4 Seasonality

```text
normalized_index_p = seasonality_index_p / average(all_seasonality_indices)
seasonal_baseline_p = baseline_p * normalized_index_p
```

If history is insufficient, default to 1.0 or an explicit assumption and label it as assumed.

### 13.5 Weighted pipeline

```text
weighted_opportunity_i =
  amount_i
  * stage_probability_i
  * close_date_allocation_i
  * scenario_probability_multiplier
```

Won opportunities flow into committed/recognized revenue; lost opportunities contribute zero. Manual probability overrides require reason and audit record.

### 13.6 Conversion-based new revenue

```text
expected_conversions_p = qualified_leads_p * conversion_rate_p
new_business_revenue_p = expected_conversions_p * average_value_p
```

Conversion-based revenue only fills uncovered lead cohorts and must not double count pipeline generated from the same leads.

### 13.7 Repeat revenue

```text
expected_repeat_orders_p = eligible_customers_p * repeat_rate_p * average_repeat_frequency_p
repeat_revenue_p = expected_repeat_orders_p * average_repeat_value_p
```

Contracted recurring revenue remains separate from statistically expected repeat revenue.

### 13.8 Capacity ceiling

```text
unit_capacity_p = available_resource_units_p * throughput_per_unit_p * working_time_p
capacity_revenue_ceiling_p = unit_capacity_p * average_value_per_output_p

billable_hours_p = available_hours_p * target_utilization_p
capacity_revenue_ceiling_p = billable_hours_p * average_billable_rate_p

capacity_constrained_revenue_p = min(unconstrained_revenue_p, capacity_revenue_ceiling_p)
```

Unmet demand is shown separately.

### 13.9 Canonical revenue forecast

```text
committed_revenue_p = contracted_revenue_p + scheduled_recognizable_revenue_p

expected_revenue_p = weighted_pipeline_p + uncovered_conversion_revenue_p + expected_repeat_revenue_p

unconstrained_revenue_p =
  (committed_revenue_p + expected_revenue_p)
  * normalized_seasonality_index_p

forecast_revenue_p = min(unconstrained_revenue_p, capacity_revenue_ceiling_p)
```

If capacity is not relevant or not configured, `forecast_revenue_p = unconstrained_revenue_p`.

### 13.10 Cash forecast

```text
closing_cash_p = opening_cash_p + cash_inflows_p - cash_outflows_p
```

Cash inflows include expected invoice collections, cash sales, funding, and other inflows. Outflows include committed costs, variable costs, debt service, tax, and capital expenditure.

### 13.11 Growth gap

```text
target_gap_p = target_revenue_p - forecast_revenue_p
required_additional_sales_p = max(0, target_gap_p)
required_additional_customers_p = ceil(required_additional_sales_p / average_value_p)
required_additional_leads_p = ceil(required_additional_customers_p / conversion_rate_p)
```

Default £1M interpretation: **annual recognized revenue in the venture's reporting currency**.

### 13.12 Scenario model

At minimum: Conservative, Base, Ambitious.

Scenario inputs may alter lead volume, conversion, average value, stage probabilities, close timing, repeat rate, churn, capacity, utilization, seasonality, collection delay, variable costs, planned hiring, or capex.

Assumptions are explicit, editable by authorized users, versioned, and immutable once attached to a published forecast.

### 13.13 Statistical ranges

Release 1 may calculate ranges from historical residuals. The UI must describe them as statistical ranges, not guaranteed confidence intervals, unless assumptions are validated.

### 13.14 Deterministic risks and recommendations

Rules may raise target-gap, pipeline-coverage, capacity, cash-threshold, or stale-data risks. Every output stores rule ID/version, triggering values, thresholds, evidence, severity, recommended action, timestamp, status, reviewer decision, and resolution/dismissal reason.

## 14. API Groups

All APIs are versioned under `/api/v1`. Venture-scoped endpoints require resolved `venture_id` and server-side authorization.

Primary groups: Auth, Users, Ventures, Memberships, Command, Metrics, Ideas, Research, Goals, Plans, Financial Planning, Risks, Compliance, CRM, Pipeline, Operations, Scheduling, Finance, Growth, Forecasts, Scenarios, Recommendations, Portfolio, Integrations, Notifications, Audit, Billing, Support.

### API requirements

- JSON request and response bodies.
- OpenAPI specification generated and checked in CI.
- Cursor pagination for mutable collections.
- Idempotency keys for financial writes and external commands.
- Optimistic concurrency for high-contention records.
- Standard machine-readable errors with correlation IDs.
- UTC timestamps using ISO 8601.
- Integer minor units for money plus ISO currency code.
- Webhook signature verification and replay protection.
- Rate limits by user, venture, route, and provider.
- Audit events for security-sensitive and financially material mutations.

## 15. RBAC Summary

Permission domains include venture, command, build, CRM, finance, operations, growth, forecast, risk, recommendation, team, integration, billing, audit, portfolio, and capital allocation permissions.

Enforcement rules:

- UI authorization is advisory; API authorization is authoritative.
- PostgreSQL RLS enforces tenant isolation independently of application checks.
- Background jobs execute with an explicit venture and service identity.
- Portfolio queries require both portfolio membership and access to included venture data.
- Support access requires time-bound impersonation, reason capture, and audit logging.
- Permission changes invalidate affected sessions or cached authorization state.

## 16. Data Model Summary

### Core tenancy

- `ventures`
- `users`
- `venture_memberships`
- `settings`
- `audit_log`

### Finance

- `transactions`
- `quotes`
- `quote_line_items`
- `invoices`
- `invoice_line_items`
- `budgets`

### CRM and operations

- `clients`
- `contacts`
- `interactions`
- `jobs`
- `team_members`
- `assets`
- `schedule_slots`

### Growth and planning

- `campaigns`
- `pipeline_opportunities`
- `market_research`
- `risk_register`

### Intelligence

- `forecasts`
- `forecast_assumptions`
- `forecast_actuals`
- `recommendations`

Recommendations should store generation type so rule/statistical/AI-assisted/ML/manual origins are distinguishable.

### Portfolio

- `portfolios`
- `portfolio_memberships`
- `portfolio_ventures`
- `capital_allocation_scenarios`
- `capital_allocations`
- `exchange_rates`

### Common data rules

- Venture-owned entities require `venture_id NOT NULL`.
- Primary keys use UUIDs.
- Money uses integer minor units and currency codes.
- Timestamps are stored in UTC.
- Provider IDs are unique within provider and venture scope.
- JSON fields require schemas and must not replace stable relational columns.
- Material entities include actor metadata where applicable.
- Forecast input snapshots are immutable.
- RLS policies cover reads, writes, updates, and deletes.

## 17. Integration Specification

Initial integrations:

| Provider | Purpose | Phase |
|---|---|---|
| Xero | Transactions, invoices, contacts, balances | P1 |
| Stripe | Subscription billing, payments, payment events | P0/P1 |
| GoCardless | Direct debit mandates and payments | P1 |
| Twilio | SMS and delivery status | P2 |
| SendGrid | Transactional email and delivery events | P0/P1 |
| Google Calendar | Availability and scheduled events | P1 |
| Google Maps | Address lookup, geocoding, travel estimates | P1 |
| Google Ads | Campaign spend and performance | P2 |
| Companies House | UK company lookup and verification | P0 |

Integration requirements:

- Credentials encrypted at rest.
- Secrets outside source and database plaintext.
- Minimum OAuth scopes.
- Connection status and last successful sync visible.
- Sync cursors retained per venture/provider.
- Every synchronization creates a `sync_run`.
- Imports idempotent.
- Source IDs/timestamps retained.
- Webhooks signature-verified and deduplicated.
- Bounded exponential retry with dead-letter workflow.
- Disconnect revokes provider tokens where supported.

## 18. Suggested Technical Architecture

### Application

- Next.js with TypeScript.
- React Server Components where appropriate.
- Route handlers or structured server layer for REST.
- Shared schema validation.
- Modular monolith organized by domain.

### Persistence and infrastructure

- PostgreSQL system of record.
- PostgreSQL RLS for tenant isolation.
- Redis for queues, rate limiting, locks, and short-lived caches.
- BullMQ for imports, sync, forecast runs, notifications, and reports.
- S3-compatible storage for attachments, exports, evidence, and generated reports.

### Service boundaries

- Domain logic independent of framework route handlers.
- Provider adapters implement stable integration interfaces.
- Forecast calculations run in TypeScript during P1–P3 unless profiling proves a separate runtime is justified.
- Python/FastAPI is permitted later for workloads that justify separation.

### Testing

- Vitest/Jest for unit and integration tests.
- Playwright for E2E.
- PostgreSQL integration tests.
- Provider adapter contract tests.
- RLS tests using multiple users/ventures.
- Golden-fixture tests for forecast formulas and explanations.

## 19. Phased Delivery

### P0 — Foundation

Authentication, email verification/recovery, onboarding, venture tenancy/switching, profile/security, team membership, RBAC, billing foundation, notifications/audit foundation, error states, PostgreSQL schema/RLS, CI/CD, secrets, observability, backup/recovery, Companies House, SendGrid, and required Stripe subscription setup.

Exit criteria:

- User can create account, venture, invite a member, assign role, complete onboarding.
- Cross-venture access fails at API and database layers.
- Security-sensitive mutations are audited.
- Deployment and rollback tested.

### P1 — Command & Operate Core

Command Centre, £1M Growth Command, finance, CRM, live pipeline/growth, scheduling, quotes/invoices, jobs, capacity, assets, Forecast vs Actual, integration settings, Xero, Stripe payments, GoCardless, Google Calendar, Google Maps, initial deterministic revenue/cash forecasts.

Exit criteria:

- Operational records drive Command metrics.
- Forecasts generated from explicit inputs.
- Forecasts reproducible from immutable snapshots.
- Finance/pipeline imports idempotent.
- Legacy dashboard redirects to Command.

### P2 — Build & Intelligence

Build planning screens, goals, blueprints, launches, funding, financial models, functional plans, risk/compliance, scenario assumptions/comparison, deterministic/statistical Copilot, explainable risks/recommendations, Twilio, Google Ads, recommendation decision workflow.

Exit criteria:

- Plans/targets connect to actuals.
- Conservative, Base, Ambitious scenarios can be compared.
- Every forecast/recommendation exposes evidence and calculation details.
- No dependency on trained ML models.

### P3 — Portfolio & Scale

Portfolio Command, venture pipeline, capital allocation, multi-currency normalization, portfolio memberships/permissions, cross-venture KPI comparison, performance/data-retention improvements, export/privacy workflows.

### P4 — ML Data Maturity

Data-quality/model-readiness scoring, governed training datasets, backtesting, deterministic-baseline comparison, model registry/monitoring/drift/rollback, and optional learned forecasting only where it materially outperforms deterministic baselines.

## 20. Non-Functional Requirements

### Security

TLS, encryption at rest, PostgreSQL RLS, MFA, secure HTTP-only same-site browser sessions, CSRF protection where applicable, rate limiting, credential-stuffing protection, signed webhooks/replay protection, dependency scanning, secret rotation, immutable/protected audit logs.

### Performance

- Core page server response target: p95 < 500 ms excluding third-party latency.
- Interactive page target: usable within 2.5 seconds on representative broadband.
- Core API target: p95 < 400 ms for non-reporting endpoints.
- Long-running imports and forecasts execute asynchronously.
- Dashboard metrics use bounded caching with freshness indicators.

### Reliability

Idempotent jobs/webhooks, automated backups, PITR where supported, documented RTO/RPO, health checks, correlation IDs across requests/jobs.

### Accessibility

WCAG 2.2 AA, complete keyboard support, visible focus states, semantic headings/labels, accessible validation/error summaries, text/table alternatives for charts, no color-only status indicators.

### Privacy

Data minimization, configurable retention, data export, account/venture deletion with legal-retention exceptions, provider consent/scope visibility, no cross-tenant model training without explicit future governance.

## 21. Analytics and Observability

Track onboarding, integration lifecycle, Command views, key object creation, forecast lifecycle, recommendation decisions, risk lifecycle, and portfolio scenario lifecycle.

Operational telemetry includes request rate/errors/latency, queue depth/runtime/retries/dead letters, sync age/failures, forecast run duration/failure, data freshness, auth denials, RLS test status, and webhook validation/deduplication.

Analytics must never include passwords, tokens, raw financial descriptions, or unnecessary personal data.

## 22. Definition of Done

A product screen or capability is done only when all applicable criteria are met.

### Product and Design

- Canonical route implemented.
- Screen matches approved Figma frame and responsive behaviour.
- Loading, empty, error, partial-data, stale-data, offline, and unauthorized states handled.
- Navigation follows canonical product hierarchy.
- Legacy links redirect where specified.
- Copy distinguishes plans, actuals, forecasts, and recommendations.

### Functionality

- Required CRUD/archive/recovery workflows work correctly.
- Validation exists client and server side.
- Money, currency, timezone, and date handling are correct.
- Material mutations generate audit events.
- Forecasts expose formulas, inputs, assumptions, and freshness.
- No Release 1 workflow depends on ML.

### Authorization and Security

- API permission checks implemented.
- PostgreSQL RLS policies implemented and tested.
- Cross-venture access tests pass.
- Sensitive data not exposed through logs/errors/analytics.
- Integration secrets encrypted.
- Webhooks authenticated and idempotent.
- Security findings resolved or explicitly accepted.

### Data and APIs

- Database migrations reversible or recoverable.
- Required indexes and constraints exist.
- REST endpoints documented in OpenAPI.
- Error responses use standard schema and correlation IDs.
- Pagination/filtering/sorting deterministic.
- Provider records preserve provenance.
- Forecast versions/input snapshots immutable after publication.

### Quality

- Unit tests cover domain rules and forecast formulas.
- Integration tests cover persistence, queues, and adapters.
- Playwright covers critical journeys.
- Accessibility checks pass with no critical violations.
- Supported desktop/mobile layouts verified.
- Performance targets met or exceptions documented.
- Production-critical observability dashboards/alerts exist.

### Operations

- Feature flags and rollout strategy defined where needed.
- Deployment and rollback tested.
- Background jobs have retry/dead-letter handling.
- Support documentation and failure runbooks exist.
- Product analytics validated.
- Release and migration notes complete.

### Acceptance Gate

A phase is complete only when:

- Exit criteria are satisfied.
- No unresolved severity-one defects remain.
- Severity-two defects have approved disposition.
- Security, privacy, accessibility, and data-isolation reviews pass.
- Production monitoring confirms successful operation after release.

---

## Canonical design reference

Figma: `Director-xo` — file key `rqWc0iFUFSTdudXuO4Gm47`.

The Figma engineering specification and this repository document are complementary. Product/engineering rules in this specification take precedence over obsolete technical labels in older roadmap frames. Individual product screens must remain visually aligned with the approved Figma designs while implementing the canonical routes, permissions, tenancy, data provenance, deterministic forecasting, and delivery gates defined here.
