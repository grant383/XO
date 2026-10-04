import { randomUUID } from "node:crypto";
import { CORRELATION_HEADER, getAuth } from "@/modules/identity";

export const dynamic = "force-dynamic";

const CORRELATION_ID = /^[A-Za-z0-9._-]{8,128}$/;

/**
 * Better Auth endpoints under the versioned API (spec §14): `/api/v1/auth/*`.
 * Adds a correlation id to every request/response and forbids caching of auth responses.
 */
async function handle(request: Request): Promise<Response> {
  const incoming = request.headers.get(CORRELATION_HEADER);
  const correlationId = incoming && CORRELATION_ID.test(incoming) ? incoming : randomUUID();
  const headers = new Headers(request.headers);
  headers.set(CORRELATION_HEADER, correlationId);

  const response = await getAuth().handler(new Request(request, { headers }));

  const out = new Response(response.body, response);
  out.headers.set(CORRELATION_HEADER, correlationId);
  out.headers.set("Cache-Control", "no-store");
  return out;
}

export { handle as GET, handle as POST };
