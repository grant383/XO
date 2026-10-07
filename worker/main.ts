import {
  closeEmailOutbox,
  EMAIL_OUTBOX_POLICY,
  emailOutboxCounts,
  startEmailWorker,
} from "@/platform/email";
import { logger } from "@/platform/observability/logger";
import { redis } from "@/platform/redis";

/**
 * Background worker process (ADR-0006, ADR-0010, ADR-0023): same codebase as the web
 * service, separate start command (`pnpm worker`). It holds no database credentials and
 * runs as an explicit service identity. Deploy it with `SERVICE_NAME=worker`.
 */
const DEPTH_INTERVAL_MS = 60_000;

const worker = startEmailWorker();
await worker.waitUntilReady();
logger.info({ serviceId: EMAIL_OUTBOX_POLICY.serviceId }, "worker started");

// Queue depth, delayed retries and dead letters for alerting (spec §21).
const depth = setInterval(() => {
  emailOutboxCounts()
    .then((counts) =>
      logger.info({ serviceId: EMAIL_OUTBOX_POLICY.serviceId, queue: counts }, "email queue depth"),
    )
    .catch(() =>
      logger.warn({ serviceId: EMAIL_OUTBOX_POLICY.serviceId }, "queue depth unavailable"),
    );
}, DEPTH_INTERVAL_MS);

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ serviceId: EMAIL_OUTBOX_POLICY.serviceId, signal }, "worker stopping");
  clearInterval(depth);
  // Lets in-flight jobs finish; unfinished jobs are retried by the next worker.
  await worker.close();
  await closeEmailOutbox();
  redis().disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
