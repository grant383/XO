import { isIP } from "node:net";

/**
 * Resolves the client IP for rate limiting and audit.
 *
 * Behind exactly one trusted reverse proxy (Railway edge), the proxy appends the peer
 * address to `X-Forwarded-For`, so the rightmost entry is the only value a client cannot
 * forge. Entries further left are client-controlled and ignored. Returns `undefined`
 * when no valid address is present (callers bucket these together).
 */
export function clientIp(
  headers: Headers | undefined,
  headerName = process.env.CLIENT_IP_HEADER ?? "x-forwarded-for",
): string | undefined {
  const raw = headers?.get(headerName);
  if (!raw) return undefined;
  const candidate = raw.split(",").at(-1)?.trim();
  if (!candidate || isIP(candidate) === 0) return undefined;
  return candidate;
}
