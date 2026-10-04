import { describe, expect, it } from "vitest";
import { clientIp, MemoryRateLimitStore, subjectKey } from "@/platform/security";

const rule = { windowSec: 60, max: 3 };

describe("MemoryRateLimitStore", () => {
  it("allows up to max hits per window, then blocks with a retry-after", async () => {
    let now = 1_000_000;
    const store = new MemoryRateLimitStore(() => now);
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await store.consume("k", rule));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3]!.retryAfterSec).toBe(60);

    now += 30_000;
    expect((await store.consume("k", rule)).retryAfterSec).toBe(30);

    now += 30_001;
    expect(await store.consume("k", rule)).toMatchObject({ allowed: true, count: 1 });
  });

  it("peek does not record a hit and reports exhaustion", async () => {
    const store = new MemoryRateLimitStore();
    expect(await store.peek("p", rule)).toEqual({ allowed: true, count: 0, retryAfterSec: 0 });
    for (let i = 0; i < 3; i++) await store.consume("p", rule);
    expect(await store.peek("p", rule)).toMatchObject({ allowed: false, count: 3 });
    expect(await store.peek("p", rule)).toMatchObject({ count: 3 });
  });

  it("reset clears a window", async () => {
    const store = new MemoryRateLimitStore();
    for (let i = 0; i < 3; i++) await store.consume("r", rule);
    await store.reset("r");
    expect(await store.peek("r", rule)).toMatchObject({ allowed: true, count: 0 });
  });

  it("isolates keys", async () => {
    const store = new MemoryRateLimitStore();
    for (let i = 0; i < 3; i++) await store.consume("a", rule);
    expect((await store.consume("b", rule)).allowed).toBe(true);
  });
});

describe("subjectKey", () => {
  it("is stable across case and whitespace, keyed, and does not contain the subject", () => {
    const a = subjectKey("Founder@Example.test ", "secret-1");
    expect(a).toBe(subjectKey("founder@example.test", "secret-1"));
    expect(a).not.toBe(subjectKey("founder@example.test", "secret-2"));
    expect(a).not.toContain("founder");
  });
});

describe("clientIp", () => {
  const h = (value: string) => new Headers({ "x-forwarded-for": value });

  it("uses the rightmost (proxy-appended) hop", () => {
    expect(clientIp(h("203.0.113.9"), "x-forwarded-for")).toBe("203.0.113.9");
    expect(clientIp(h("1.2.3.4, 203.0.113.9"), "x-forwarded-for")).toBe("203.0.113.9");
    expect(clientIp(h("2001:db8::1"), "x-forwarded-for")).toBe("2001:db8::1");
  });

  it("rejects malformed values and missing headers", () => {
    expect(clientIp(h("not-an-ip"), "x-forwarded-for")).toBeUndefined();
    expect(clientIp(h("1.2.3.4, evil"), "x-forwarded-for")).toBeUndefined();
    expect(clientIp(new Headers(), "x-forwarded-for")).toBeUndefined();
    expect(clientIp(undefined, "x-forwarded-for")).toBeUndefined();
  });
});
