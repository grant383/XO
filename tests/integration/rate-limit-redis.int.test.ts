import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RedisRateLimitStore } from "@/platform/security";

let redis: Redis;
let store: RedisRateLimitStore;

beforeAll(() => {
  redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:63799", {
    maxRetriesPerRequest: 1,
  });
  store = new RedisRateLimitStore(redis, `dxo:test:${randomUUID()}:`);
});
afterAll(async () => {
  await redis.quit();
});

describe("RedisRateLimitStore", () => {
  it("is atomic under a concurrent burst (credential-stuffing shape)", async () => {
    const rule = { windowSec: 60, max: 10 };
    const decisions = await Promise.all(
      Array.from({ length: 50 }, () => store.consume("burst", rule)),
    );
    expect(decisions.filter((d) => d.allowed)).toHaveLength(10);
    expect(Math.max(...decisions.map((d) => d.count))).toBe(50);
    expect(decisions.every((d) => d.retryAfterSec > 0 && d.retryAfterSec <= 60)).toBe(true);
  });

  it("peeks without consuming and resets", async () => {
    const rule = { windowSec: 30, max: 2 };
    expect(await store.peek("p", rule)).toEqual({ allowed: true, count: 0, retryAfterSec: 0 });
    await store.consume("p", rule);
    await store.consume("p", rule);
    expect(await store.peek("p", rule)).toMatchObject({ allowed: false, count: 2 });
    await store.reset("p");
    expect(await store.peek("p", rule)).toMatchObject({ allowed: true, count: 0 });
  });

  it("expires windows", async () => {
    const rule = { windowSec: 1, max: 1 };
    await store.consume("e", rule);
    expect((await store.consume("e", rule)).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 1100));
    expect((await store.consume("e", rule)).allowed).toBe(true);
  });
});
