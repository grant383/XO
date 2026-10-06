import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { session, log } = vi.hoisted(() => ({
  session: vi.fn(),
  log: { info: vi.fn(), error: vi.fn() },
}));
vi.mock("@/modules/identity", () => ({ getSession: session }));
vi.mock("@/platform/config/env", () => ({ appEnv: () => ({ APP_URL: "http://localhost:3000" }) }));
vi.mock("@/platform/redis", () => ({ redis: () => ({}) }));
vi.mock("@/platform/security", () => ({
  RedisRateLimitStore: class {
    async consume() {
      return { allowed: true };
    }
  },
}));
vi.mock("@/platform/observability/logger", () => ({ logger: log }));
import { accountApi, readJson } from "@/app/api/_shared/account";

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({ userId: randomUUID() });
});
describe("account API boundary", () => {
  it("returns JSON 401 with correlation ID and never calls the handler when signed out", async () => {
    session.mockResolvedValue(null);
    const handler = vi.fn();
    const response = await accountApi(new Request("http://localhost:3000/api/v1/support"), handler);
    expect(response.status).toBe(401);
    expect((await response.json()).error.correlationId).toBe(
      response.headers.get("x-correlation-id"),
    );
    expect(handler).not.toHaveBeenCalled();
  });
  it("requires the exact Origin for writes", async () => {
    for (const origin of [undefined, "https://evil.test", "null"]) {
      const handler = vi.fn();
      const response = await accountApi(
        new Request("http://localhost:3000/api/v1/support", {
          method: "POST",
          headers: origin ? { origin } : undefined,
        }),
        handler,
      );
      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    }
    expect(
      (
        await accountApi(
          new Request("http://localhost:3000/api/v1/support", {
            method: "POST",
            headers: { origin: "http://localhost:3000" },
          }),
          async () => ({ ok: true }),
        )
      ).status,
    ).toBe(200);
  });
  it("redacts exception content and request data from telemetry and errors", async () => {
    const secret = "private-financial-data";
    const response = await accountApi(
      new Request(`http://localhost:3000/api/v1/support?token=${secret}`, {
        headers: { cookie: secret },
      }),
      async () => {
        throw new Error(secret);
      },
    );
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain(secret);
    expect(JSON.stringify(log.error.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(log.info.mock.calls)).not.toContain(secret);
  });
  it("bounds the JSON body by bytes and rejects malformed input", async () => {
    await expect(
      readJson(new Request("http://localhost:3000", { method: "POST", body: "a".repeat(16385) })),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      readJson(new Request("http://localhost:3000", { method: "POST", body: "not JSON" })),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      await readJson(
        new Request("http://localhost:3000", { method: "POST", body: '{"subject":"Help"}' }),
      ),
    ).toEqual({ subject: "Help" });
  });
});
