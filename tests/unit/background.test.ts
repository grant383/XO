import { describe, expect, it } from "vitest";
import { runInBackground, settleBackgroundTasks } from "@/modules/identity/background";

describe("runInBackground", () => {
  it("never leaves a rejected task unhandled", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      runInBackground(Promise.reject(new Error("queue unavailable")));
      let ran = false;
      runInBackground(Promise.resolve().then(() => (ran = true)));
      await settleBackgroundTasks();
      await new Promise((resolve) => setImmediate(resolve));
      expect(ran).toBe(true);
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
