# P0 foundation audit — 6 October 2026

Branch: `p0/foundation`. Sources read in full: product specification and Figma implementation map. The product specification governs behaviour and architecture.

## Findings before changes

| Requirement | Evidence | Result |
|---|---|---|
| Notifications and Activity, 33:3910 | No route, notifications module or notification persistence; append-only audit foundation exists | Missing |
| Billing and Subscription, 33:4087 | No route, billing tables, subscription adapter or webhook; ADR-0011 is a decision only | Missing |
| Help and Support, 33:4290 | No `/support`, support module or request persistence | Missing |
| Account, venture, invite, roles, onboarding journey | Existing identity/ventures/memberships services and journey tests | Implemented; rerun verification |
| API and database isolation | RLS migrations and multi-venture tests; server actions authenticate independently | Implemented; rerun verification |
| Security mutation auditing | Identity audit store and database functions write audit events; append-only policies tested | Implemented; rerun verification |
| Deployment and rollback tested | CI builds/tests, ADR-0010 records Railway intent; no deployment/rollback or restore drill evidence | Exit criterion unsatisfied |
| Backup/PITR and RTO/RPO | ADR-0010 targets RPO 15 minutes / RTO 4 hours; configuration and timed restore drill outstanding | Missing operational evidence |
| API documentation | Better Auth REST exists; onboarding/team use server actions; no checked-in OpenAPI contract | Missing |
| Production telemetry | Pino redaction and readiness/liveness exist; no production alert/dashboard or release-monitoring evidence | Incomplete |
| Login error canonical route | Inline Figma error exists, `/auth/login/error` absent | Missing route; reuse existing screen |
| Loading | Venture-shell `loading.tsx` exists; account loading coverage needs checking | Verify coverage |

The two maps disagree: the Figma map calls login error COMPLETE while the capability matrix correctly records the absent route. Older notes claiming that synchronous workspace creation requires a bootstrap job are not supported by spec §5/§18: long-running work belongs in a queue, but this small atomic creation does not need rebuilding. P1 integration OAuth remains P1.

## Closure rule

Do not rebuild completed slices or mark P0 closed from a rendering shell. Add focused, separately committed missing slices with tests and update both maps. P1 Command Centre remains gated on P0 exit criteria, including deployment/rollback evidence. Production monitoring and real provider configuration cannot be certified from local tests.

## Verified fixes

- Canonical login-error route: existing form reused; real retry and validated deep link pass desktop/mobile Playwright and axe.
- Baseline verification: 190 unit tests and 250 database integration/RLS tests passed before the new slices.
- Local environment inspection: Stripe, SendGrid and Companies House keys are unset. Railway CLI reports no linked project. Real subscription setup, staging deployment/rollback and production monitoring are not certified.

- Help & Support: missing slice implemented (ADR-0017), seven unit tests, ten database/catalog checks and desktop/mobile Playwright + axe pass. Final screenshots and 19×19 search-icon geometry checked.
- User confirmed local-only deployment on 7 October: no DirectorXO Railway resources exist; do not create/link resources or use BlueprintOS. No Stripe recurring price is approved. Keep commits local; no merge, push or deployment. P0 remains open and P1 is gated.

- Notifications & Activity: missing slice implemented (ADR-0018), two unit tests, ten database/catalog checks and desktop/mobile Playwright + axe pass. Final screenshots inspected. Read completion is awaited before reload in the persistence test.

- Error/loading gaps: Next.js unhandled server errors now emit privacy-safe incident metadata without exception content, request URLs, headers or identifiers (three unit checks). Profile & Security reuses the existing shared Figma loading component. Production alerts/release monitoring are not certified.

- Local logical restore drill passed: 19 public tables, migration history, row counts/content digests, ownership/table grants, FORCE RLS/policies and security-function definitions/grants verified in 226.39 seconds. The fresh temporary database was removed. This does not certify production PITR, RPO or RTO; see `docs/runbooks/P0_RELEASE_RECOVERY.md`.
- Full database regression: 262/263 initially passed; the sole failure was the audit TRUNCATE test encountering the new inbox FK before the append-only trigger. The test now proves both FK and CASCADE-trigger rejection and unchanged audit count; all 24 related audit/notification/billing/catalog checks pass.

- Final local restore drill passed with column grants and trigger definitions added: 19 public tables, migration history, row content/counts, table/column grants, ownership, FORCE RLS/policies and security-function definitions/grants verified in 242.87 seconds; temporary database removed. Still no production PITR/RPO/RTO certification.
- Final database regression passes all 265 tests. Unit suite passes 210 tests, plus the new offline identity contract check. Production build and typecheck pass; lint has five SVG `<img>` warnings and no errors.

## Email outbox and P0 infrastructure freeze — 7 October 2026

- Identity email outbox completed as already started and kept minimal (ADR-0023): one BullMQ queue, six bounded attempts with exponential backoff, metadata-only dead-letter queue, one `pnpm worker` entry point, payloads sealed with AES-256-GCM. Team invitations still send inline (unchanged).
- Verification: format check, typecheck and production build pass. Lint has the same five `<img>` warnings and no errors. Unit suite: 266 tests (22 files). Database integration/RLS suite: 271 tests (27 files), including six outbox tests against real Redis (encrypted at rest, idempotent enqueue, retry, exhaustion, permanent rejection, undecryptable payload). Playwright now starts the worker. Onboarding and team journeys (four desktop tests) pass with email delivered through the queue. The full desktop/mobile E2E matrix was not rerun.
- **Infrastructure freeze (user decision, 7 October).** No further P0 infrastructure, worker features, telemetry, providers, queues or deployment abstractions. The following are **deferred deployment gates**, not current build work:
  - Railway services: web and worker, staging deployment and rollback.
  - Live Stripe configuration and an approved recurring price.
  - Production PITR, with RPO/RTO certified by a timed restore.
  - Production monitoring and alerting, including dead-letter and queue-depth alerts.
  - Execution of the GitHub Actions CI workflow. It is defined, but no commits are pushed.
- **Conflict recorded.** The Closure rule above and spec §19 gate P1 on deployment/rollback evidence. The user has directed work to move to P1 Command Centre with these gates deferred. They must pass before any production release.
