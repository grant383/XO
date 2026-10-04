import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closePools } from "@/platform/db";
import { logger } from "@/platform/observability/logger";
import { LOGIN_FAILURE_LIMIT, login, RATE_LIMITS } from "@/modules/identity";
import { RedisRateLimitStore, subjectKey, type RateLimitStore } from "@/platform/security";
import { adminSql } from "../../helpers/db";
import { auditWhere } from "../../helpers/audit";
import {
  api,
  createVerifiedUser,
  freshIp,
  installTestAuth,
  signIn,
  uniqueEmail,
  uninstallTestAuth,
} from "../../helpers/auth";

let admin: Sql;
let t: ReturnType<typeof installTestAuth>;

beforeAll(() => {
  admin = adminSql();
  t = installTestAuth();
});
afterAll(async () => {
  uninstallTestAuth();
  await closePools();
  await admin.end();
});

const WRONG = "wrong-password-attempt";

describe("per-IP limits", () => {
  it("throttles sign-in attempts from one IP with a 429 and Retry-After, without affecting other IPs", async () => {
    const ip = freshIp();
    const max = RATE_LIMITS["/sign-in/email"]!.ip.max;
    for (let i = 0; i < max; i++) {
      const res = await api("/sign-in/email", {
        body: { email: uniqueEmail("spray"), password: WRONG },
        ip,
      });
      expect(res.status).toBe(401);
    }
    const blocked = await api("/sign-in/email", {
      body: { email: uniqueEmail("spray"), password: WRONG },
      ip,
    });
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      code: "RATE_LIMITED",
      message: "Too many attempts. Please wait and try again.",
    });
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);

    const other = await api("/sign-in/email", {
      body: { email: uniqueEmail("spray"), password: WRONG },
      ip: freshIp(),
    });
    expect(other.status).toBe(401);

    const audited =
      await admin`select 1 from audit_log where action = 'auth.rate_limited' and ip_address = ${ip}`;
    expect(audited).toHaveLength(1);
  });

  it("ignores spoofed left-most X-Forwarded-For entries", async () => {
    const proxyHop = freshIp();
    const max = RATE_LIMITS["/sign-in/email"]!.ip.max;
    for (let i = 0; i <= max; i++) {
      await api("/sign-in/email", {
        body: { email: uniqueEmail("xff"), password: WRONG },
        ip: `10.${i}.0.1, ${proxyHop}`,
      });
    }
    const res = await api("/sign-in/email", {
      body: { email: uniqueEmail("xff"), password: WRONG },
      ip: `10.99.0.1, ${proxyHop}`,
    });
    expect(res.status).toBe(429);
  });
  it("does not pool requests without a client IP into one shared bucket", async () => {
    const max = RATE_LIMITS["/sign-in/email"]!.ip.max;
    for (let i = 0; i <= max + 1; i++) {
      const res = await api("/sign-in/email", {
        body: { email: uniqueEmail("no-ip"), password: WRONG },
        ip: "",
      });
      expect(res.status).toBe(401);
    }
  });
});

describe("credential-stuffing protection (per account)", () => {
  it("still locks an account by failures when the client IP is missing", async () => {
    const u = await createVerifiedUser(t.mailbox, "no-ip-lock");
    for (let i = 0; i < LOGIN_FAILURE_LIMIT.max; i++) await signIn(u.email, WRONG, "");
    expect((await signIn(u.email, u.password, "")).res.status).toBe(429);
  });

  it("locks an account after repeated failures from many IPs, even for the correct password", async () => {
    const u = await createVerifiedUser(t.mailbox, "locked");
    for (let i = 0; i < LOGIN_FAILURE_LIMIT.max; i++) {
      expect((await signIn(u.email, WRONG, freshIp())).res.status).toBe(401);
    }
    const blocked = await signIn(u.email, u.password, freshIp());
    expect(blocked.res.status).toBe(429);
    expect(blocked.res.body).toMatchObject({ code: "RATE_LIMITED" });
    expect(blocked.res.setCookies.filter((c) => c.includes("session_token"))).toEqual([]);

    const accountKey = subjectKey(u.email, process.env.AUTH_SECRET!);
    expect(await auditWhere(admin, "auth.login.locked", { accountKey })).toHaveLength(1);
    expect(await auditWhere(admin, "auth.login.blocked", { accountKey })).toHaveLength(1);
    expect(await auditWhere(admin, "auth.login.failed", { accountKey })).toHaveLength(
      LOGIN_FAILURE_LIMIT.max,
    );
  });

  it("locks unknown accounts identically (no enumeration through lockout)", async () => {
    const ghost = uniqueEmail("ghost-lock");
    for (let i = 0; i < LOGIN_FAILURE_LIMIT.max; i++) await signIn(ghost, WRONG, freshIp());
    const blocked = await signIn(ghost, WRONG, freshIp());
    expect(blocked.res.status).toBe(429);
    expect(blocked.res.body).toMatchObject({ code: "RATE_LIMITED" });
  });

  it("clears the failure counter after a successful sign-in", async () => {
    const u = await createVerifiedUser(t.mailbox, "reset-counter");
    for (let i = 0; i < LOGIN_FAILURE_LIMIT.max - 1; i++) await signIn(u.email, WRONG, freshIp());
    expect((await signIn(u.email, u.password, freshIp())).res.status).toBe(200);
    for (let i = 0; i < LOGIN_FAILURE_LIMIT.max - 1; i++) {
      expect((await signIn(u.email, WRONG, freshIp())).res.status).toBe(401);
    }
    expect((await signIn(u.email, u.password, freshIp())).res.status).toBe(200);
  });

  it("limits password-reset emails per account regardless of source IP", async () => {
    const u = await createVerifiedUser(t.mailbox, "reset-flood");
    const max = RATE_LIMITS["/request-password-reset"]!.account!.max;
    for (let i = 0; i < max; i++) {
      expect(
        (await api("/request-password-reset", { body: { email: u.email }, ip: freshIp() })).status,
      ).toBe(200);
    }
    const blocked = await api("/request-password-reset", {
      body: { email: u.email },
      ip: freshIp(),
    });
    expect(blocked.status).toBe(429);
    expect(
      t.mailbox.outbox.filter((m) => m.to === u.email && m.category === "auth.reset-password"),
    ).toHaveLength(max);
  });

  it("limits registration attempts per address", async () => {
    const email = uniqueEmail("reg-flood");
    const max = RATE_LIMITS["/sign-up/email"]!.account!.max;
    for (let i = 0; i < max; i++) {
      await api("/sign-up/email", {
        body: { name: "F", email, password: "flood-password-123" },
        ip: freshIp(),
      });
    }
    const blocked = await api("/sign-up/email", {
      body: { name: "F", email, password: "flood-password-123" },
      ip: freshIp(),
    });
    expect(blocked.status).toBe(429);
  });
});

describe("server-side calls", () => {
  it("applies the same limits to server actions that call auth.api directly", async () => {
    const u = await createVerifiedUser(t.mailbox, "server-action");
    for (let i = 0; i < LOGIN_FAILURE_LIMIT.max; i++) {
      const r = await login(
        { email: u.email, password: WRONG },
        new Headers({ "x-forwarded-for": freshIp() }),
      );
      expect(r).toMatchObject({ ok: false, code: "INVALID_CREDENTIALS" });
    }
    const r = await login(
      { email: u.email, password: u.password },
      new Headers({ "x-forwarded-for": freshIp() }),
    );
    expect(r).toMatchObject({ ok: false, code: "RATE_LIMITED" });
  });
});

describe("storage", () => {
  it("enforces lockout through the Redis store used in production", async () => {
    const redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: 1 });
    const store = new RedisRateLimitStore(redis, `dxo:test:${randomUUID()}:`);
    const local = installTestAuth({ store });
    try {
      const u = await createVerifiedUser(local.mailbox, "redis-lock");
      for (let i = 0; i < LOGIN_FAILURE_LIMIT.max; i++) await signIn(u.email, WRONG, freshIp());
      expect((await signIn(u.email, u.password, freshIp())).res.status).toBe(429);
    } finally {
      await redis.quit();
      t = installTestAuth();
    }
  });

  it("fails open (and logs an error) if the rate-limit store is unavailable", async () => {
    const broken: RateLimitStore = {
      consume: () => Promise.reject(new Error("ECONNREFUSED")),
      peek: () => Promise.reject(new Error("ECONNREFUSED")),
      reset: () => Promise.reject(new Error("ECONNREFUSED")),
    };
    const local = installTestAuth({ store: broken });
    const errorSpy = vi.spyOn(logger, "error");
    try {
      const u = await createVerifiedUser(local.mailbox, "fail-open");
      expect((await signIn(u.email, u.password)).res.status).toBe(200);
      expect(errorSpy.mock.calls.some((c) => c[1] === "rate limiter unavailable")).toBe(true);
    } finally {
      errorSpy.mockRestore();
      t = installTestAuth();
    }
  });
});
