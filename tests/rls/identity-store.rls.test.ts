import { randomUUID } from "node:crypto";
import postgres from "postgres";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminSql, appRoleSql, expectPgError, RLS_VIOLATION, seedTwoVentures } from "../helpers/db";

/**
 * Identity-store isolation (ADR-0009): sessions, credentials, verification values and
 * consumed-token records are reachable only through `dxo_auth`, and `dxo_auth` cannot
 * reach venture data.
 */
let admin: Sql;
let app: Sql;
let auth: Sql;
let f: Awaited<ReturnType<typeof seedTwoVentures>>;

const IDENTITY_TABLES = ["sessions", "accounts", "verifications", "auth_consumed_tokens"] as const;

beforeAll(async () => {
  admin = adminSql();
  app = appRoleSql();
  auth = postgres(process.env.AUTH_DATABASE_URL!, { max: 1, onnotice: () => {} });
  f = await seedTwoVentures(admin);
  await admin`insert into sessions (user_id, token, expires_at)
              values (${f.user.alice}, ${`tok-${randomUUID()}`}, now() + interval '1 day')`;
  await admin`insert into accounts (user_id, account_id, provider_id, password)
              values (${f.user.alice}, ${f.user.alice}, 'credential', 'scrypt-hash')`;
});

afterAll(async () => {
  await Promise.all([admin.end(), app.end(), auth.end()]);
});

describe("dxo_app (runtime) cannot reach the identity store", () => {
  for (const table of IDENTITY_TABLES) {
    it(`has no privileges on ${table}`, async () => {
      const [row] = await admin<{ any: boolean }[]>`
        select has_table_privilege('dxo_app', ${`public.${table}`}, 'SELECT')
            or has_table_privilege('dxo_app', ${`public.${table}`}, 'INSERT')
            or has_table_privilege('dxo_app', ${`public.${table}`}, 'UPDATE')
            or has_table_privilege('dxo_app', ${`public.${table}`}, 'DELETE') as any`;
      expect(row!.any).toBe(false);
    });
  }

  it("cannot read session tokens even with a valid user context", async () => {
    await expectPgError(
      app.begin(async (tx) => {
        await tx`select set_config('app.actor_type', 'user', true),
                        set_config('app.user_id', ${f.user.alice}, true)`;
        return tx`select token from sessions`;
      }),
      RLS_VIOLATION,
    );
  });

  it("cannot read password hashes", async () => {
    await expectPgError(app`select password from accounts`, RLS_VIOLATION);
  });

  it("cannot write users (identity is owned by Better Auth)", async () => {
    await expectPgError(
      app`update users set email_verified = true where id = ${f.user.mallory}`,
      RLS_VIOLATION,
    );
  });
});

describe("dxo_auth (identity store) cannot reach venture data", () => {
  it("cannot read ventures or memberships", async () => {
    await expectPgError(auth`select id from ventures`, RLS_VIOLATION);
    await expectPgError(auth`select id from venture_memberships`, RLS_VIOLATION);
  });

  it("cannot read the audit log", async () => {
    await expectPgError(auth`select id from audit_log`, RLS_VIOLATION);
  });

  it("can write account-level audit events but not venture events", async () => {
    await auth`insert into audit_log (actor_type, action, outcome)
               values ('anonymous', 'auth.login.failed', 'failure')`;
    await expectPgError(
      auth`insert into audit_log (venture_id, actor_type, actor_user_id, action)
           values (${f.ventureA}, 'user', ${f.user.alice}, 'venture.updated')`,
      RLS_VIOLATION,
      "row-level security",
    );
  });

  it("manages sessions, credentials and verification values", async () => {
    const token = `tok-${randomUUID()}`;
    await auth`insert into sessions (user_id, token, expires_at)
               values (${f.user.bob}, ${token}, now() + interval '1 hour')`;
    const [s] = await auth`select user_id from sessions where token = ${token}`;
    expect(s!.user_id).toBe(f.user.bob);
    await auth`delete from sessions where token = ${token}`;
    expect(await auth`select 1 from sessions where token = ${token}`).toHaveLength(0);
  });

  it("can record a consumed token once and can never un-consume it", async () => {
    const hash = randomUUID();
    await auth`insert into auth_consumed_tokens (token_hash, purpose, expires_at)
               values (${hash}, 'email-verification', now() + interval '1 hour')`;
    await expectPgError(
      auth`insert into auth_consumed_tokens (token_hash, purpose, expires_at)
           values (${hash}, 'email-verification', now() + interval '1 hour')`,
      "23505",
    );
    await expectPgError(
      auth`delete from auth_consumed_tokens where token_hash = ${hash}`,
      RLS_VIOLATION,
    );
    await expectPgError(
      auth`update auth_consumed_tokens set purpose = 'x' where token_hash = ${hash}`,
      RLS_VIOLATION,
    );
  });
});
