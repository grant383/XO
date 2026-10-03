import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { databaseEnv } from "@/platform/config/env";
import * as schema from "../schema";

/**
 * Raw connection pools. Never import outside `src/platform/db` (enforced by ESLint):
 * all application data access must go through the context wrappers in `../context`.
 */
function createDb(url: string, max: number) {
  const client = postgres(url, {
    max,
    onnotice: () => {},
    connection: { application_name: "directorxo" },
  });
  return { client, db: drizzle(client, { schema }) };
}

type Pool = ReturnType<typeof createDb>;
let appPool: Pool | undefined;
let authPool: Pool | undefined;

/** Runtime pool (role `dxo_app`, subject to RLS). */
export function appPoolDb() {
  appPool ??= createDb(databaseEnv().DATABASE_URL, databaseEnv().DB_POOL_MAX);
  return appPool.db;
}

/** Identity-store pool (role `dxo_auth`). Used only by the Better Auth adapter. */
export function authPoolDb() {
  authPool ??= createDb(
    databaseEnv().AUTH_DATABASE_URL,
    Math.max(2, Math.floor(databaseEnv().DB_POOL_MAX / 2)),
  );
  return authPool.db;
}

export async function closePools() {
  await Promise.all([appPool?.client.end(), authPool?.client.end()]);
  appPool = undefined;
  authPool = undefined;
}

export type AppDb = ReturnType<typeof appPoolDb>;
