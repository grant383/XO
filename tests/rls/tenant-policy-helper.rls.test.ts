import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools, withService, withTenant } from "@/platform/db";
import { adminSql, expectPgError, RLS_VIOLATION, seedTwoVentures } from "../helpers/db";

/**
 * `app.apply_tenant_policies()` is the standard way P1+ migrations protect a
 * venture-owned table. This exercises it on a throwaway table.
 */
const table = `rls_probe_${randomUUID().slice(0, 8)}`;
let admin: Sql;
let f: Awaited<ReturnType<typeof seedTwoVentures>>;

beforeAll(async () => {
  admin = adminSql();
  f = await seedTwoVentures(admin);
  await admin.unsafe(`
    create table public.${table} (
      id uuid primary key default gen_random_uuid(),
      venture_id uuid not null references public.ventures(id),
      label text not null);
    grant select, insert, update, delete on public.${table} to dxo_app;
    select app.apply_tenant_policies('public.${table}');`);
  await admin.unsafe(
    `insert into public.${table} (venture_id, label) values ($1, 'a'), ($2, 'b')`,
    [f.ventureA, f.ventureB],
  );
});

afterAll(async () => {
  await admin.unsafe(`drop table if exists public.${table}`);
  await closePools();
  await admin.end();
});

const q = (s: string) => sql.raw(s.replaceAll("$t", `public.${table}`));

describe("app.apply_tenant_policies", () => {
  it("enables and forces RLS with one policy per command", async () => {
    const [c] =
      await admin`select relrowsecurity, relforcerowsecurity from pg_class where oid = ${`public.${table}`}::regclass`;
    expect(c).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    const cmds = await admin`select cmd from pg_policies where tablename = ${table} order by cmd`;
    expect(cmds.map((r) => r.cmd)).toEqual(["DELETE", "INSERT", "SELECT", "UPDATE"]);
  });

  it("isolates reads, writes and deletes to the active venture", async () => {
    const ctx = { userId: f.user.alice, ventureId: f.ventureA };
    const rows = await withTenant(ctx, (tx) =>
      tx.execute<{ label: string }>(q("select label from $t")),
    );
    expect(rows.map((r) => r.label)).toEqual(["a"]);

    await expectPgError(
      withTenant(ctx, (tx) =>
        tx.execute(sql`insert into ${q("$t")} (venture_id, label) values (${f.ventureB}, 'x')`),
      ),
      RLS_VIOLATION,
    );
    await expectPgError(
      withTenant(ctx, (tx) => tx.execute(sql`update ${q("$t")} set venture_id = ${f.ventureB}`)),
      RLS_VIOLATION,
    );
    const deleted = await withTenant({ userId: f.user.bob, ventureId: f.ventureA }, (tx) =>
      tx.execute(q("delete from $t returning id")),
    );
    expect(deleted).toHaveLength(0);
  });

  it("applies the same isolation to service identities", async () => {
    const rows = await withService({ serviceId: "worker:probe", ventureId: f.ventureB }, (tx) =>
      tx.execute<{ label: string }>(q("select label from $t")),
    );
    expect(rows.map((r) => r.label)).toEqual(["b"]);
  });
});
