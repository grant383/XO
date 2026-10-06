import { randomUUID } from "node:crypto";
import type { Instrumentation } from "next";
import type { Logger } from "pino";

type Request = Parameters<Instrumentation.onRequestError>[1];
type Context = Parameters<Instrumentation.onRequestError>[2];
/** Log an allowlisted incident record, never exception content, URLs, headers or actor data. */
export function reportRequestError(log: Pick<Logger, "error">, request: Request, context: Context) {
  const method = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(
    request.method,
  )
    ? request.method
    : "OTHER";
  const routeType = ["render", "route", "action", "proxy"].includes(context.routeType)
    ? context.routeType
    : "unknown";
  const routerKind = context.routerKind === "App Router" ? "App Router" : "Pages Router";
  log.error(
    {
      event: "http.unhandled_error",
      correlationId: randomUUID(),
      status: 500,
      method,
      routeType,
      routerKind,
    },
    "Unhandled server request error",
  );
}
