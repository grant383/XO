import { randomUUID } from "node:crypto";
import type { Worker } from "bullmq";
import { afterAll, beforeAll } from "vitest";
import { configureEmailOutboxForTests, closeEmailOutbox, startEmailWorker } from "@/platform/email";

/**
 * Database suites deliver identity email through the real BullMQ outbox (ADR-0023): each file
 * gets its own Redis key prefix and an in-process worker with a short retry backoff.
 */
let worker: Worker | undefined;

beforeAll(async () => {
  await configureEmailOutboxForTests({ prefix: `dxo-test-${randomUUID()}`, backoffMs: 10 });
  worker = startEmailWorker({ concurrency: 2 });
  await worker.waitUntilReady();
});

afterAll(async () => {
  await worker?.close();
  await closeEmailOutbox();
});
