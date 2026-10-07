import { randomUUID } from "node:crypto";
import type { Worker } from "bullmq";
import Redis from "ioredis";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  configureEmailOutboxForTests,
  EmailDeliveryError,
  EMAIL_OUTBOX_POLICY,
  emailOutboxCounts,
  enqueueEmail,
  MemoryTransport,
  setEmailTransportForTests,
  startEmailWorker,
  type EmailMessage,
  type EmailTransport,
} from "@/platform/email";

/**
 * The identity email outbox against real Redis (ADR-0023): durable queueing, encrypted
 * payloads, idempotent enqueue, bounded retry and metadata-only dead letters. Each test
 * runs under its own key prefix; the global setup worker is stopped for this file.
 */
const TOKEN = "single-use-token-abc123";
const message = (to = "outbox@example.test"): EmailMessage => ({
  to,
  category: "auth.reset-password",
  subject: "Reset your DirectorXO password",
  text: `https://app.test/auth/reset-password?token=${TOKEN}`,
  html: `<a href="https://app.test/auth/reset-password?token=${TOKEN}">Reset</a>`,
});

class FlakyTransport implements EmailTransport {
  readonly provider = "sendgrid" as const;
  calls = 0;
  readonly delivered = new MemoryTransport();
  constructor(
    private readonly failures: number,
    private readonly status?: number,
  ) {}
  async send(m: EmailMessage, from: { email: string }) {
    this.calls += 1;
    if (this.calls <= this.failures) throw new EmailDeliveryError("sendgrid", this.status ?? 503);
    return this.delivered.send(m, from);
  }
}

let redis: Redis;
let prefix: string;
let worker: Worker | undefined;

beforeAll(() => {
  redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: 1 });
});
afterAll(async () => {
  await redis.quit();
});

beforeEach(async () => {
  prefix = `dxo-outbox-${randomUUID()}`;
  await configureEmailOutboxForTests({ prefix, backoffMs: 5 });
});
afterEach(async () => {
  await worker?.close();
  worker = undefined;
  setEmailTransportForTests(undefined);
  const keys = await redis.keys(`${prefix}:*`);
  if (keys.length) await redis.del(...keys);
});

async function idle() {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const c = await emailOutboxCounts();
    if (!c.waiting && !c.active && !c.delayed && !c.prioritized) return c;
    if (Date.now() > deadline) throw new Error(JSON.stringify(c));
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function deadLetters() {
  const ids = await redis.lrange(`${prefix}:${EMAIL_OUTBOX_POLICY.deadLetterQueue}:wait`, 0, -1);
  return Promise.all(
    ids.map(async (id) =>
      JSON.parse(
        (await redis.hget(`${prefix}:${EMAIL_OUTBOX_POLICY.deadLetterQueue}:${id}`, "data"))!,
      ),
    ),
  );
}

/** Every value stored under the test prefix, for leak checks. */
async function everything(): Promise<string> {
  const keys = await redis.keys(`${prefix}:*`);
  const parts: string[] = [];
  for (const key of keys) {
    const type = await redis.type(key);
    if (type === "hash") parts.push(JSON.stringify(await redis.hgetall(key)));
    else if (type === "string") parts.push(String(await redis.get(key)));
    else if (type === "list") parts.push((await redis.lrange(key, 0, -1)).join(" "));
    else if (type === "zset") parts.push((await redis.zrange(key, 0, "-1")).join(" "));
    else if (type === "stream") parts.push(JSON.stringify(await redis.xrange(key, "-", "+")));
  }
  return parts.join("\n");
}

describe("email outbox (ADR-0023)", () => {
  it("queues durably with the payload encrypted, then delivers and removes it", async () => {
    const result = await enqueueEmail(message(), TOKEN);
    expect(result.status).toBe("queued");

    // No worker yet: the job waits in Redis, sealed. Neither the link nor the address leak.
    const stored = await everything();
    expect(stored).toContain("auth.reset-password");
    expect(stored).not.toContain(TOKEN);
    expect(stored).not.toContain("outbox@example.test");

    const mailbox = new MemoryTransport();
    setEmailTransportForTests(mailbox);
    worker = startEmailWorker();
    await idle();
    expect(mailbox.outbox).toHaveLength(1);
    expect(mailbox.outbox[0]!.text).toContain(TOKEN);
    expect(await redis.exists(`${prefix}:${EMAIL_OUTBOX_POLICY.queue}:${result.jobId}`)).toBe(0);
  });

  it("ignores a repeated enqueue of the same logical send", async () => {
    const mailbox = new MemoryTransport();
    setEmailTransportForTests(mailbox);
    worker = startEmailWorker();
    const first = await enqueueEmail(message(), TOKEN);
    const again = await enqueueEmail(message(), TOKEN);
    expect(again).toEqual({ status: "duplicate", jobId: first.jobId });
    await idle();
    // Still a duplicate after delivery, within the idempotency window.
    expect((await enqueueEmail(message(), TOKEN)).status).toBe("duplicate");
    await idle();
    expect(mailbox.outbox).toHaveLength(1);
    // The key is stored only as a hash.
    expect(await everything()).not.toContain(TOKEN);
  });

  it("retries transient provider failures with backoff and then delivers", async () => {
    const transport = new FlakyTransport(2);
    setEmailTransportForTests(transport);
    worker = startEmailWorker();
    await enqueueEmail(message(), randomUUID());
    const counts = await idle();
    expect(transport.calls).toBe(3);
    expect(transport.delivered.outbox).toHaveLength(1);
    expect(counts.deadLetter).toBe(0);
  });

  it("dead-letters after the bounded attempts with metadata only", async () => {
    const transport = new FlakyTransport(Number.POSITIVE_INFINITY);
    setEmailTransportForTests(transport);
    worker = startEmailWorker();
    const { jobId } = await enqueueEmail(message(), randomUUID());
    const counts = await idle();
    expect(transport.calls).toBe(EMAIL_OUTBOX_POLICY.attempts);
    expect(counts.deadLetter).toBe(1);
    const [dead] = await deadLetters();
    expect(dead).toMatchObject({
      category: "auth.reset-password",
      reason: "exhausted",
      attempts: EMAIL_OUTBOX_POLICY.attempts,
      provider: "sendgrid",
      status: 503,
    });
    // The failed job and its sealed payload are gone; nothing sensitive remains anywhere.
    expect(await redis.exists(`${prefix}:${EMAIL_OUTBOX_POLICY.queue}:${jobId}`)).toBe(0);
    const stored = await everything();
    expect(stored).not.toContain(TOKEN);
    expect(stored).not.toContain("outbox@example.test");
  });

  it("dead-letters a permanent provider rejection without retrying", async () => {
    const transport = new FlakyTransport(Number.POSITIVE_INFINITY, 401);
    setEmailTransportForTests(transport);
    worker = startEmailWorker();
    await enqueueEmail(message(), randomUUID());
    await idle();
    expect(transport.calls).toBe(1);
    const [dead] = await deadLetters();
    expect(dead).toMatchObject({ reason: "rejected", attempts: 1, status: 401 });
  });

  it("dead-letters a payload that cannot be opened (tampered or wrong key)", async () => {
    const mailbox = new MemoryTransport();
    setEmailTransportForTests(mailbox);
    const { jobId } = await enqueueEmail(message(), randomUUID());
    const key = `${prefix}:${EMAIL_OUTBOX_POLICY.queue}:${jobId}`;
    const data = JSON.parse((await redis.hget(key, "data"))!);
    await redis.hset(key, "data", JSON.stringify({ ...data, sealed: `${data.sealed}x` }));
    worker = startEmailWorker();
    await idle();
    expect(mailbox.outbox).toHaveLength(0);
    const [dead] = await deadLetters();
    expect(dead).toMatchObject({ reason: "undecryptable", attempts: 1 });
  });
});
