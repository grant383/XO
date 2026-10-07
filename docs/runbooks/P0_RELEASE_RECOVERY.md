# P0 release and recovery evidence

DirectorXO is local only. No Railway project/staging environment or recurring Stripe price is approved. These instructions prepare future verification; they do not authorize creating resources, linking projects, pushing, merging or deploying. BlueprintOS must not be used.

## Current local gate

Run typecheck, lint, formatting, generated OpenAPI drift check, unit tests, database/RLS tests, browser journeys and production build against the current local commit. Database tests reset only the disposable test database. Record the commit, versions and results in `docs/P0_AUDIT.md`. Keep focused commits and the two implementation maps consistent.

Stripe checkout remains disabled until a real recurring Price ID, secret and signing secret are supplied. Test fixtures are synthetic and never provider configuration. Companies House and SendGrid adapters require separate real-provider evidence. Do not claim provider delivery or subscription setup from fixture tests.

## Local logical restore drill

After database tests finish, with the local Compose PostgreSQL running:

```sh
python3 scripts/local_restore_drill.py
```

The script accepts no remote/source connection argument. It dumps `directorxo_test` in memory, creates a unique temporary local database, restores the archive with original ownership/security, compares row counts/content digests, table/column grants, trigger definitions, FORCE RLS/policies and security-function definitions/grants, then drops only the database it created. It prints no row data or credentials. A changing source fails the drill. A failed cleanup must be resolved before recording success.

This verifies a local logical restore. It does not establish continuous WAL archiving, PITR, encrypted external backups, production RPO or production RTO. ADR-0010 requires RPO ≤15 minutes and RTO ≤4 hours; both require provider configuration and timed recovery evidence.

## Staging evidence after explicit authorization

1. Identify the approved DirectorXO project and staging environment. Record their identifiers without credentials. Verify isolation from other applications and production.
2. Configure separate least-privilege web/auth/migration database roles, secrets, Redis, email and approved Stripe test resources. Confirm backup encryption, retention and continuous recovery coverage capable of the required RPO.
3. Record the previous and candidate commit/image digests. Back up the database and test restore into an isolated recovery environment before a release.
4. Apply additive migrations with the migrator role; runtime receives only app/auth roles. Release the candidate, then verify health/readiness, auth/onboarding/invitation/roles, API and database isolation, signed webhook retries and real-provider flows. Check error rates/latency and privacy-safe logs.
5. Exercise application rollback to the recorded previous image. Preserve additive schema and user data. Verify health and critical journeys again. Do not drop support requests, notification/audit records or subscription receipts as rollback.
6. Perform a timed PITR drill to a specified UTC point in an isolated recovery environment. Verify roles/grants/FORCE RLS, expected data before/after the recovery point and key journeys. Record recovery point lag and elapsed restoration/recovery time against the objectives. Switch traffic only with explicit approval.
7. Record deployment, rollback, restore and post-release monitoring evidence against the actual tested commit. P0 stays open until all exit criteria and phase acceptance requirements pass.

## Alert and incident foundations

Next.js unhandled server errors emit structured `http.unhandled_error` records with an incident UUID, status, method, route type and router kind. Account APIs log status/latency, and billing webhooks log retryable failures. These records exclude exception text, stack traces, request URLs/queries, cookies, headers and actor identifiers. Do not export raw audit metadata to a telemetry sink.

A future staging/production environment must configure and exercise error-rate, latency, readiness, webhook-retry and backup-age/recovery alerts. Associate alert events with the running commit/image and record an incident/rollback response. Local log generation does not certify a working production dashboard or alert delivery.
