# ADR-0023 — Identity email outbox and worker (BullMQ)

- Status: Accepted
- Date: 2026-10-07

## Context

Identity email (verification, password reset, security notices) was sent inline from the web process via `runInBackground`. A provider outage or process restart lost the message, and there was no retry or failure record. ADR-0006 and ADR-0010 already reserve a BullMQ worker process; P0 step 7 adds it.

## Decision

Keep it minimal: one queue, one dead-letter queue, one worker entry point.

- **Producer.** Identity flows call `enqueueEmail(message, idempotencyKey)` (`src/platform/email/outbox.ts`). The key is the single-use token where one exists, otherwise a random UUID. A Redis `SET NX` marker (24 h) suppresses duplicate enqueues; the key is stored only as a SHA-256 digest. Enqueue is retried three times before failing.
- **Payload at rest.** Messages contain single-use links, so the job holds only the category in clear plus the message sealed with AES-256-GCM (`src/platform/security/envelope.ts`), with the job id as associated data. Jobs are removed from Redis on completion or failure.
- **Retries.** Six attempts with exponential backoff from 15 s (about 7.5 minutes in total, inside the shortest link lifetime). Provider statuses 400/401/403/404/413 are permanent and not retried.
- **Dead letters.** Exhausted, rejected or undecryptable jobs are recorded in `email-dead-letter` with metadata only: category, reason, attempts, provider and status. No address, subject, body or error text.
- **Worker.** `pnpm worker` (`worker/main.ts`) runs as `SERVICE_NAME=worker` with service identity `worker:email-delivery`. It holds no database credentials. On SIGTERM it closes the worker, so in-flight jobs finish and unfinished jobs are retried. It logs queue depth once a minute.
- **Delivery semantics.** Delivery is at least once. A crash after the provider accepts a message can resend it, and every identity email is safe to receive twice.
- **Key rotation.** Set the new key as `ENCRYPTION_KEY` and the old one as `ENCRYPTION_KEY_PREVIOUS`. Remove the previous key once the queue has drained (at most the retry window).

Team invitations still send inline. They already report `emailSent: false` to the inviter, who can revoke and re-send.

## Alternatives considered

A PostgreSQL outbox table polled by the worker would avoid Redis for durability but needs a database role for the worker and a polling loop. BullMQ was already the recorded choice (ADR-0006, ADR-0010).

## Consequences

- Email-dependent tests run a real worker: database suites start one in-process per file (`tests/setup/email-outbox.ts`), and Playwright starts `pnpm worker` beside the dev server.
- Deployment needs a second Railway service with the same image and `pnpm worker` as its start command. This is a deferred deployment gate, as are alerting on dead letters and queue depth.
- Out of scope: scheduling, dashboards, extra queues and further orchestration.
