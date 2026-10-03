import Redis from "ioredis";
import { redisEnv } from "@/platform/config/env";

let client: Redis | undefined;

/** Shared Redis connection for caches, locks and rate limits (BullMQ uses its own). */
export function redis(): Redis {
  client ??= new Redis(redisEnv().REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 2 });
  return client;
}

export async function pingRedis(): Promise<void> {
  const reply = await redis().ping();
  if (reply !== "PONG") throw new Error("Unexpected Redis PING reply");
}
