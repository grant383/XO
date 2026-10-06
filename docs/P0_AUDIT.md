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
