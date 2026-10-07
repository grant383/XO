import { appEnv } from "@/platform/config/env";
import { redis } from "@/platform/redis";
import { RedisRateLimitStore } from "@/platform/security";
import { randomUUID } from "node:crypto";
import { getSession } from "@/modules/identity";
import { logger } from "@/platform/observability/logger";
import type { Actor } from "@/modules/ventures";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Account REST boundary. Never logs request bodies, cookies, query strings or exception messages. */
export async function accountApi(request: Request, handler: (actor: Actor) => Promise<unknown>) {
  const correlationId = randomUUID();
  const start = performance.now();
  let status = 200;
  try {
    const session = await getSession(request.headers);
    if (!session) throw new HttpError(401, "UNAUTHENTICATED", "Sign in to continue");
    const limit = await new RedisRateLimitStore(redis()).consume(
      `account-api:${session.userId}:${request.method}`,
      { windowSec: 60, max: request.method === "GET" ? 120 : 20 },
    );
    if (!limit.allowed)
      throw new HttpError(429, "LIMIT", "Too many requests. Please try again later.");
    if (request.method !== "GET") {
      const expected = new URL(appEnv().APP_URL).origin;
      if (request.headers.get("origin") !== expected)
        throw new HttpError(403, "FORBIDDEN", "Request origin is not permitted");
    }
    const result = await handler({ userId: session.userId, correlationId });
    return Response.json(result, {
      headers: { "x-correlation-id": correlationId, "cache-control": "no-store" },
    });
  } catch (error) {
    status = error instanceof HttpError ? error.status : 500;
    if (status === 500)
      logger.error({ correlationId, event: "http.error", status }, "Account API failed");
    return Response.json(
      {
        error: {
          code: error instanceof HttpError ? error.code : "INTERNAL_ERROR",
          message: error instanceof HttpError ? error.message : "Unable to complete the request",
          correlationId,
        },
      },
      { status, headers: { "x-correlation-id": correlationId, "cache-control": "no-store" } },
    );
  } finally {
    logger.info(
      {
        correlationId,
        event: "http.request",
        method: request.method,
        status,
        durationMs: Math.round(performance.now() - start),
      },
      "Account API request",
    );
  }
}

export async function readBody(request: Request, maxBytes = 16_384) {
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let bytes = 0;
  if (reader) {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel();
          throw new HttpError(413, "TOO_LARGE", "Request body is too large");
        }
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    } finally {
      reader.releaseLock();
    }
  }
  return body;
}

export async function readJson(request: Request) {
  const body = await readBody(request);
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new HttpError(400, "VALIDATION", "A JSON request body is required");
  }
}
