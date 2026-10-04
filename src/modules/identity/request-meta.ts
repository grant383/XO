import { clientIp } from "@/platform/security";

/** Request attributes recorded on security events. Never includes cookies or bodies. */
export type RequestMeta = {
  ip?: string;
  userAgent?: string;
  correlationId?: string;
};

export const CORRELATION_HEADER = "x-correlation-id";
const CORRELATION_ID = /^[A-Za-z0-9._-]{8,128}$/;

type HasHeaders =
  { headers?: Headers | undefined; request?: Request | undefined } | null | undefined;

export function headersOf(ctx: HasHeaders): Headers | undefined {
  return ctx?.headers ?? ctx?.request?.headers;
}

export function requestMeta(ctx: HasHeaders): RequestMeta {
  const headers = headersOf(ctx);
  const correlationId = headers?.get(CORRELATION_HEADER) ?? undefined;
  return {
    ip: clientIp(headers),
    userAgent: headers?.get("user-agent")?.slice(0, 512) ?? undefined,
    correlationId: correlationId && CORRELATION_ID.test(correlationId) ? correlationId : undefined,
  };
}
