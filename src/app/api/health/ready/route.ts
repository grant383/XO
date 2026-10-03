import { pingDatabase } from "@/platform/db";
import { logger } from "@/platform/observability/logger";
import { pingRedis } from "@/platform/redis";

export const dynamic = "force-dynamic";

/** Readiness: dependencies required to serve traffic are reachable. */
export async function GET() {
  const checks = await Promise.allSettled([pingDatabase(), pingRedis()]);
  const [database, redis] = checks.map((c) => (c.status === "fulfilled" ? "ok" : "error"));
  const ready = checks.every((c) => c.status === "fulfilled");
  if (!ready) {
    logger.warn({ database, redis }, "readiness check failed");
  }
  return Response.json(
    { status: ready ? "ok" : "unavailable", checks: { database, redis } },
    { status: ready ? 200 : 503 },
  );
}
