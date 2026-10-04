import { createHmac } from "node:crypto";
import type Redis from "ioredis";

/** A fixed-window limit: at most `max` hits per `windowSec`. */
export type RateLimitRule = { windowSec: number; max: number };

export type RateLimitDecision = {
  allowed: boolean;
  /** Hits recorded in the current window, including this one when consumed. */
  count: number;
  /** Seconds until the window resets (0 when no window is active). */
  retryAfterSec: number;
};

/**
 * Storage for rate-limit counters. `consume` must be atomic so concurrent requests
 * cannot all pass a stale read (credential-stuffing bursts are concurrent by design).
 */
export interface RateLimitStore {
  /** Records one hit and reports whether it is within the limit. */
  consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision>;
  /** Reports the current state without recording a hit. */
  peek(key: string, rule: RateLimitRule): Promise<RateLimitDecision>;
  reset(key: string): Promise<void>;
}

// INCR + EXPIRE-on-first-hit in one round trip; returns [count, ttlSeconds].
const CONSUME_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then redis.call('EXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return {count, ttl}
`;

export class RedisRateLimitStore implements RateLimitStore {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = "dxo:rl:",
  ) {}

  async consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
    const [count, ttl] = (await this.redis.eval(
      CONSUME_LUA,
      1,
      this.prefix + key,
      String(rule.windowSec),
    )) as [number, number];
    return { allowed: count <= rule.max, count, retryAfterSec: Math.max(ttl, 0) };
  }

  async peek(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
    const [[, raw], [, ttl]] = (await this.redis
      .multi()
      .get(this.prefix + key)
      .ttl(this.prefix + key)
      .exec()) as [[null, string | null], [null, number]];
    const count = raw === null ? 0 : Number(raw);
    return { allowed: count < rule.max, count, retryAfterSec: Math.max(ttl, 0) };
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(this.prefix + key);
  }
}

/** Process-local store for unit tests and single-process development only. */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  private current(key: string) {
    const w = this.windows.get(key);
    if (w && w.resetAt <= this.now()) {
      this.windows.delete(key);
      return undefined;
    }
    return w;
  }

  private retryAfter(resetAt: number) {
    return Math.max(Math.ceil((resetAt - this.now()) / 1000), 0);
  }

  async consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
    const w = this.current(key) ?? { count: 0, resetAt: this.now() + rule.windowSec * 1000 };
    w.count += 1;
    this.windows.set(key, w);
    return {
      allowed: w.count <= rule.max,
      count: w.count,
      retryAfterSec: this.retryAfter(w.resetAt),
    };
  }

  async peek(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
    const w = this.current(key);
    if (!w) return { allowed: true, count: 0, retryAfterSec: 0 };
    return {
      allowed: w.count < rule.max,
      count: w.count,
      retryAfterSec: this.retryAfter(w.resetAt),
    };
  }

  async reset(key: string): Promise<void> {
    this.windows.delete(key);
  }
}

/**
 * Keyed, irreversible identifier for a rate-limit subject (e.g. an email address), so
 * counters never store personal data or allow offline enumeration of known addresses.
 */
export function subjectKey(value: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(value.trim().toLowerCase())
    .digest("base64url")
    .slice(0, 32);
}
