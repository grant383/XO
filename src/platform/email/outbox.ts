import { createHash } from "node:crypto";
import { Queue, UnrecoverableError, Worker, type ConnectionOptions, type Job } from "bullmq";
import { redisEnv } from "@/platform/config/env";
import { logger } from "@/platform/observability/logger";
import { redis } from "@/platform/redis";
import { open, seal } from "@/platform/security/envelope";
import { sendEmail } from "./send";
import { EmailDeliveryError, type EmailMessage } from "./types";

/**
 * Durable transactional email delivery (ADR-0023). Producers enqueue a sealed message on
 * BullMQ; the worker process (`worker/main.ts`) delivers it with bounded exponential retry.
 * Jobs that cannot be delivered move to a metadata-only dead-letter queue.
 *
 * Payloads contain single-use links, so they are encrypted at rest in Redis (AES-256-GCM,
 * bound to the job id) and removed from Redis once the job completes or is dead-lettered.
 * Delivery is at least once: a crash after the provider accepts a message but before the
 * job completes can resend it. Every message is safe to receive twice.
 */
export const EMAIL_OUTBOX_POLICY = {
  queue: "email-delivery",
  deadLetterQueue: "email-dead-letter",
  /** Service identity for logs and job context (spec §15). */
  serviceId: "worker:email-delivery",
  /** 1 + 5 retries: 15 s, 30 s, 1 min, 2 min, 4 min — inside the shortest link lifetime. */
  attempts: 6,
  backoffMs: 15_000,
  /** How long an idempotency key suppresses duplicate enqueues. */
  idempotencyTtlSec: 24 * 60 * 60,
  /** Provider responses that retrying cannot fix. */
  permanentStatuses: [400, 401, 403, 404, 413],
  enqueueAttempts: 3,
} as const;

type OutboxSettings = { prefix: string; backoffMs: number };
let settings: OutboxSettings = { prefix: "dxo", backoffMs: EMAIL_OUTBOX_POLICY.backoffMs };

/** Job data. Only the category is readable; the message itself is sealed. */
type EmailJob = { v: 1; category: string; sealed: string };

type DeadLetter = {
  category: string;
  reason: "rejected" | "exhausted" | "undecryptable";
  attempts: number;
  provider?: string;
  status?: number;
  failedAt: string;
};

export type EnqueueResult = { status: "queued" | "duplicate"; jobId: string };

let queue: Queue<EmailJob> | undefined;
let deadLetters: Queue<DeadLetter> | undefined;

function connection(): ConnectionOptions {
  // BullMQ requires unlimited per-request retries on its own connections.
  return { url: redisEnv().REDIS_URL, maxRetriesPerRequest: null };
}

function outboxQueue(): Queue<EmailJob> {
  queue ??= new Queue<EmailJob>(EMAIL_OUTBOX_POLICY.queue, {
    connection: connection(),
    prefix: settings.prefix,
  });
  return queue;
}

function deadLetterQueue(): Queue<DeadLetter> {
  deadLetters ??= new Queue<DeadLetter>(EMAIL_OUTBOX_POLICY.deadLetterQueue, {
    connection: connection(),
    prefix: settings.prefix,
  });
  return deadLetters;
}

const digest = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * Queues `message` for delivery. `idempotencyKey` names the logical send (for example the
 * single-use token it carries); repeats within 24 hours are ignored. The key is hashed
 * before it reaches Redis, so a token used as a key is never stored.
 */
export async function enqueueEmail(
  message: EmailMessage,
  idempotencyKey: string,
): Promise<EnqueueResult> {
  const jobId = `email-${digest(`${message.category}\u0000${idempotencyKey}`).slice(0, 40)}`;
  const q = outboxQueue();
  const client = redis();
  const marker = `${settings.prefix}:${EMAIL_OUTBOX_POLICY.queue}:idempotency:${jobId}`;

  let lastError: unknown;
  for (let attempt = 1; attempt <= EMAIL_OUTBOX_POLICY.enqueueAttempts; attempt++) {
    try {
      const claimed = await client.set(
        marker,
        "1",
        "EX",
        EMAIL_OUTBOX_POLICY.idempotencyTtlSec,
        "NX",
      );
      if (claimed !== "OK") return { status: "duplicate", jobId };
      try {
        await q.add(
          "send",
          { v: 1, category: message.category, sealed: seal(JSON.stringify(message), jobId) },
          {
            jobId,
            attempts: EMAIL_OUTBOX_POLICY.attempts,
            backoff: { type: "exponential", delay: settings.backoffMs },
            removeOnComplete: true,
            removeOnFail: true,
          },
        );
      } catch (error) {
        await client.del(marker); // let a retry of the same logical send claim the key again
        throw error;
      }
      return { status: "queued", jobId };
    } catch (error) {
      lastError = error;
      if (attempt < EMAIL_OUTBOX_POLICY.enqueueAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
      }
    }
  }
  logger.error(
    { email: { category: message.category }, outbox: { jobId } },
    "email enqueue failed",
  );
  throw lastError;
}

async function deadLetter(job: Job<EmailJob>, entry: Omit<DeadLetter, "category" | "failedAt">) {
  await deadLetterQueue().add(
    "dead-letter",
    { ...entry, category: job.data.category, failedAt: new Date().toISOString() },
    { jobId: job.id!, removeOnComplete: true },
  );
  logger.error(
    {
      serviceId: EMAIL_OUTBOX_POLICY.serviceId,
      email: { category: job.data.category, provider: entry.provider, status: entry.status },
      outbox: { jobId: job.id, reason: entry.reason, attempts: entry.attempts },
    },
    "email dead-lettered",
  );
}

/** Delivers one queued email. Exported for the worker and tests. */
export async function processEmailJob(job: Job<EmailJob>): Promise<void> {
  const attempt = job.attemptsMade + 1;
  const final = attempt >= (job.opts.attempts ?? 1);

  let message: EmailMessage;
  try {
    message = JSON.parse(open(job.data.sealed, job.id!)) as EmailMessage;
  } catch {
    await deadLetter(job, { reason: "undecryptable", attempts: attempt });
    throw new UnrecoverableError("Email payload could not be opened");
  }

  try {
    await sendEmail(message);
  } catch (error) {
    const provider = error instanceof EmailDeliveryError ? error.provider : undefined;
    const status = error instanceof EmailDeliveryError ? error.status : undefined;
    const permanent =
      status !== undefined &&
      (EMAIL_OUTBOX_POLICY.permanentStatuses as readonly number[]).includes(status);
    if (permanent || final) {
      await deadLetter(job, {
        reason: permanent ? "rejected" : "exhausted",
        attempts: attempt,
        provider,
        status,
      });
    }
    // Only provider and status reach Redis: other error text can name the recipient.
    const reason = `Email delivery failed${provider ? ` via ${provider}` : ""}${status ? ` (${status})` : ""}`;
    throw permanent ? new UnrecoverableError(reason) : new Error(reason);
  }
}

/** Starts the delivery worker. The caller owns shutdown (`worker.close()`). */
export function startEmailWorker(options: { concurrency?: number } = {}): Worker<EmailJob> {
  const worker = new Worker<EmailJob>(EMAIL_OUTBOX_POLICY.queue, processEmailJob, {
    connection: connection(),
    prefix: settings.prefix,
    concurrency: options.concurrency ?? 4,
  });
  worker.on("failed", (job, error) => {
    logger.warn(
      {
        serviceId: EMAIL_OUTBOX_POLICY.serviceId,
        email: { category: job?.data.category },
        outbox: { jobId: job?.id, attemptsMade: job?.attemptsMade, error: error.message },
      },
      "email attempt failed",
    );
  });
  worker.on("error", (error) => {
    logger.error(
      { serviceId: EMAIL_OUTBOX_POLICY.serviceId, err: { name: error.name } },
      "email worker error",
    );
  });
  return worker;
}

/** Queue depth for telemetry and tests (spec §21: queue depth, retries, dead letters). */
export async function emailOutboxCounts(): Promise<{
  waiting: number;
  active: number;
  delayed: number;
  prioritized: number;
  deadLetter: number;
}> {
  const counts = await outboxQueue().getJobCounts("waiting", "active", "delayed", "prioritized");
  const dead = await deadLetterQueue().getJobCounts("waiting");
  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    delayed: counts.delayed ?? 0,
    prioritized: counts.prioritized ?? 0,
    deadLetter: dead.waiting ?? 0,
  };
}

/** Closes producer connections (graceful shutdown and tests). */
export async function closeEmailOutbox(): Promise<void> {
  await Promise.all([queue?.close(), deadLetters?.close()]);
  queue = undefined;
  deadLetters = undefined;
}

/** Test seam: isolates a test run under its own key prefix with a short backoff. */
export async function configureEmailOutboxForTests(next: Partial<OutboxSettings>) {
  await closeEmailOutbox();
  settings = { ...settings, ...next };
}
