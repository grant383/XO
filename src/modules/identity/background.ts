/**
 * Deferred work started by authentication endpoints (email delivery). Running it after
 * the response keeps response times independent of whether an account exists, which
 * prevents timing-based account enumeration. The web process is long-lived (Railway),
 * so tasks complete after the response; BullMQ replaces this in P0 step 7.
 */
const pending = new Set<Promise<unknown>>();

export function runInBackground(task: Promise<unknown>): void {
  const tracked: Promise<unknown> = task.finally(() => pending.delete(tracked));
  pending.add(tracked);
}

/** Waits for all deferred work. Used by tests and graceful shutdown. */
export async function settleBackgroundTasks(): Promise<void> {
  while (pending.size > 0) {
    await Promise.allSettled([...pending]);
  }
}
