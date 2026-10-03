import { sql } from "drizzle-orm";
import { z } from "zod";
import { appPoolDb, type AppDb } from "./internal/clients";

/** A transaction whose PostgreSQL session carries an explicit actor/tenant context. */
export type Tx = Parameters<Parameters<AppDb["transaction"]>[0]>[0];

const uuid = z.uuid();
/** Service identities look like `worker:email` or `webhook:stripe`. */
const serviceId = z.string().regex(/^[a-z][a-z0-9_-]*:[a-z0-9_.-]{1,60}$/);

export type UserContext = { userId: string; ventureId?: string };
export type TenantContext = { userId: string; ventureId: string };
export type ServiceContext = { serviceId: string; ventureId?: string };

type Settings = {
  actorType: "user" | "service";
  userId: string;
  serviceId: string;
  ventureId: string;
};

async function run<T>(settings: Settings, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return appPoolDb().transaction(async (tx) => {
    // is_local = true: settings are discarded at commit/rollback, so they can never
    // leak to another request through a pooled connection.
    await tx.execute(sql`select
      set_config('app.actor_type', ${settings.actorType}, true),
      set_config('app.user_id', ${settings.userId}, true),
      set_config('app.service_id', ${settings.serviceId}, true),
      set_config('app.venture_id', ${settings.ventureId}, true)`);
    return fn(tx);
  });
}

/** Authenticated user without an active venture (venture switcher, account settings, venture creation). */
export async function withUser<T>(ctx: UserContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return run(
    {
      actorType: "user",
      userId: uuid.parse(ctx.userId),
      serviceId: "",
      ventureId: ctx.ventureId === undefined ? "" : uuid.parse(ctx.ventureId),
    },
    fn,
  );
}

/** Authenticated user acting within one venture. Membership is still verified by RLS. */
export async function withTenant<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withUser({ userId: ctx.userId, ventureId: uuid.parse(ctx.ventureId) }, fn);
}

/** Background job / webhook with an explicit service identity, optionally scoped to one venture. */
export async function withService<T>(ctx: ServiceContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return run(
    {
      actorType: "service",
      userId: "",
      serviceId: serviceId.parse(ctx.serviceId),
      ventureId: ctx.ventureId === undefined ? "" : uuid.parse(ctx.ventureId),
    },
    fn,
  );
}

/** Readiness probe. Runs with no tenant context, so it can read no tenant data. */
export async function pingDatabase(): Promise<void> {
  await appPoolDb().execute(sql`select 1`);
}
