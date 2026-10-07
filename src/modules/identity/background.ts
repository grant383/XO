import { logger } from "@/platform/observability/logger";

/**
 * Deferred work started by authentication endpoints (queueing email for the BullMQ worker,
 * ADR-0023). Running it after the response keeps response times independent of whether an
 * account exists, which prevents timing-based account enumeration. Delivery itself, with
 * retries and dead-lettering, happens in the worker process, not here.
 */
const pending = new Set<Promise<unknown>>();

export function runInBackground(task: Promise<unknown>): void {
  // A rejected task is logged, never left unhandled: an unhandled rejection stops Node.
  const tracked: Promise<unknown> = task
    .catch((error: unknown) => {
      logger.error(
        { err: { name: error instanceof Error ? error.name : "unknown" } },
        "background task failed",
      );
    })
    .finally(() => pending.delete(tracked));
  pending.add(tracked);
}

/** Waits for all deferred work. Used by tests and graceful shutdown. */
export async function settleBackgroundTasks(): Promise<void> {
  while (pending.size > 0) {
    await Promise.allSettled([...pending]);
  }
}
