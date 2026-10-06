import { afterEach, describe, expect, it, vi } from "vitest";
const { log } = vi.hoisted(() => ({ log: { error: vi.fn() } }));
vi.mock("@/platform/observability/logger", () => ({ logger: log }));
import { onRequestError } from "@/instrumentation";
afterEach(() => vi.unstubAllEnvs());
import { reportRequestError } from "@/platform/observability/request-error";

describe("server error telemetry", () => {
  it("records an incident without copying request secrets or dynamic routes", () => {
    const error = vi.fn();
    reportRequestError(
      { error },
      {
        path: "/invite/secret-token?password=secret-password",
        method: "POST",
        headers: { cookie: "secret-cookie", authorization: "secret-auth" },
      },
      {
        routerKind: "App Router",
        routeType: "action",
        routePath: "/private/customer@example.test",
        revalidateReason: undefined,
      },
    );
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "http.unhandled_error",
        status: 500,
        method: "POST",
        routeType: "action",
        correlationId: expect.any(String),
      }),
      "Unhandled server request error",
    );
    expect(JSON.stringify(error.mock.calls)).not.toMatch(/secret|customer@example/);
  });
  it("does not echo unexpected method values", () => {
    const error = vi.fn();
    reportRequestError(
      { error },
      { path: "/", method: "secret-method", headers: {} },
      { routerKind: "App Router", routeType: "route", routePath: "/", revalidateReason: undefined },
    );
    expect(error.mock.calls[0]?.[0].method).toBe("OTHER");
    expect(JSON.stringify(error.mock.calls)).not.toContain("secret-method");
  });
});

it("connects the Next.js Node error hook without exporting exception content", async () => {
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  await onRequestError(
    new Error("secret-exception-content"),
    { path: "/secret-path", method: "GET", headers: { cookie: "secret-cookie" } },
    {
      routerKind: "App Router",
      routeType: "render",
      routePath: "/secret-route",
      revalidateReason: undefined,
    },
  );
  expect(log.error).toHaveBeenCalledWith(
    expect.objectContaining({ event: "http.unhandled_error", status: 500 }),
    "Unhandled server request error",
  );
  expect(JSON.stringify(log.error.mock.calls)).not.toContain("secret");
});
