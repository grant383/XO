import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminSql } from "../helpers/db";

/**
 * Structural guarantees checked against the live catalogue so that a new table or
 * role can never silently skip tenant isolation (ADR-0007).
 */
let admin: Sql;

beforeAll(() => {
  admin = adminSql();
});
afterAll(async () => {
  await admin.end();
});

const RUNTIME_ROLES = ["dxo_app", "dxo_auth"] as const;
const COMMANDS = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;

describe("database roles", () => {
  it("runtime roles are not superusers, cannot bypass RLS and own nothing", async () => {
    const roles = await admin`
      select rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb
      from pg_roles where rolname in ${admin(RUNTIME_ROLES)}`;
    expect(roles).toHaveLength(RUNTIME_ROLES.length);
    for (const r of roles) {
      expect(r).toMatchObject({
        rolsuper: false,
        rolbypassrls: false,
        rolcreaterole: false,
        rolcreatedb: false,
      });
    }

    const owned = await admin`
      select c.relname, r.rolname from pg_class c join pg_roles r on r.oid = c.relowner
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'app') and r.rolname in ${admin(RUNTIME_ROLES)}`;
    expect(owned).toEqual([]);
  });

  it("only dxo_definer bypasses RLS, and it cannot log in", async () => {
    const bypass = await admin`
      select rolname, rolcanlogin from pg_roles
      where rolbypassrls and not rolsuper and rolname like 'dxo_%'`;
    expect(bypass).toEqual([{ rolname: "dxo_definer", rolcanlogin: false }]);
  });

  it("SECURITY DEFINER functions pin search_path", async () => {
    const unsafe = await admin`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app' and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`;
    expect(unsafe).toEqual([]);
  });
});

describe("row-level security coverage", () => {
  it("every table in public has RLS enabled and forced", async () => {
    const tables = await admin`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')`;
    expect(tables.length).toBeGreaterThan(0);
    const unprotected = tables
      .filter((t) => !t.relrowsecurity || !t.relforcerowsecurity)
      .map((t) => t.relname);
    expect(unprotected).toEqual([]);
  });

  it("every command a runtime role is granted on a table is governed by a policy for that role", async () => {
    const tables = await admin<{ relname: string }[]>`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')`;

    const gaps: string[] = [];
    for (const { relname } of tables) {
      for (const role of RUNTIME_ROLES) {
        for (const cmd of COMMANDS) {
          // Column-level grants count as access for SELECT/INSERT/UPDATE.
          const [{ granted }] = (await admin`
            select has_table_privilege(${role}, ${`public.${relname}`}, ${cmd})
                or (${cmd} <> 'DELETE' and has_any_column_privilege(${role}, ${`public.${relname}`}, ${cmd})) as granted`) as [
            { granted: boolean },
          ];
          if (!granted) continue;
          const policies = await admin`
            select 1 from pg_policies
            where schemaname = 'public' and tablename = ${relname}
              and cmd in (${cmd}, 'ALL')
              and (${role} = any(roles) or 'public' = any(roles))`;
          if (policies.length === 0) gaps.push(`${relname}: ${role} ${cmd}`);
        }
      }
    }
    expect(gaps).toEqual([]);
  });

  it("every venture-owned table has a NOT NULL venture_id (audit_log excepted by ADR-0008)", async () => {
    const nullable = await admin`
      select table_name from information_schema.columns
      where table_schema = 'public' and column_name = 'venture_id' and is_nullable = 'YES'
        and table_name <> 'audit_log'`;
    expect(nullable).toEqual([]);
  });
});
