import postgres from "postgres";

export type RolePasswords = { app: string; auth: string; migrator: string };

async function currentDatabase(sql: postgres.Sql): Promise<string> {
  const rows = await sql<{ db: string }[]>`select current_database() as db`;
  return rows[0]!.db;
}

const quoteLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`;
const quoteIdent = (value: string) => `"${value.replace(/"/g, '""')}"`;

/**
 * Creates/updates the least-privilege database roles and database-level grants.
 * Idempotent; safe to re-run to rotate passwords. Requires a superuser connection.
 * Roles are cluster-wide; database grants apply to the database in `adminUrl`.
 */
export async function bootstrapDatabase(adminUrl: string, passwords: RolePasswords) {
  const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });
  try {
    const db = await currentDatabase(sql);
    const roles: Array<[name: string, attrs: string, password?: string]> = [
      ["dxo_migrator", "LOGIN NOSUPERUSER NOCREATEROLE NOBYPASSRLS", passwords.migrator],
      ["dxo_app", "LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS", passwords.app],
      ["dxo_auth", "LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS", passwords.auth],
      ["dxo_definer", "NOLOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB BYPASSRLS"],
    ];
    for (const [name, attrs, password] of roles) {
      const pw = password === undefined ? "" : ` PASSWORD ${quoteLiteral(password)}`;
      const [exists] = await sql`select 1 from pg_roles where rolname = ${name}`;
      await sql.unsafe(`${exists ? "ALTER" : "CREATE"} ROLE ${quoteIdent(name)} ${attrs}${pw}`);
    }

    const dbIdent = quoteIdent(db);
    await sql.unsafe(`ALTER DATABASE ${dbIdent} OWNER TO dxo_migrator`);
    await sql.unsafe(`REVOKE ALL ON DATABASE ${dbIdent} FROM PUBLIC`);
    await sql.unsafe(`GRANT CONNECT ON DATABASE ${dbIdent} TO dxo_app, dxo_auth, dxo_migrator`);
    // Lets migrations transfer SECURITY DEFINER function ownership to dxo_definer.
    // BYPASSRLS is a role attribute and is not inherited through membership.
    await sql.unsafe(`GRANT dxo_definer TO dxo_migrator`);

    // Defensive runtime limits.
    for (const role of ["dxo_app", "dxo_auth"]) {
      await sql.unsafe(`ALTER ROLE ${role} SET statement_timeout = '30s'`);
      await sql.unsafe(`ALTER ROLE ${role} SET idle_in_transaction_session_timeout = '60s'`);
    }
  } finally {
    await sql.end();
  }
}

/** Drops and recreates application schemas. Test databases only. */
export async function resetDatabaseForTests(adminUrl: string) {
  const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });
  try {
    const db = await currentDatabase(sql);
    if (!db.endsWith("_test")) {
      throw new Error(`Refusing to reset non-test database "${db}"`);
    }
    await sql.unsafe(`DROP SCHEMA IF EXISTS app, drizzle, public CASCADE`);
    await sql.unsafe(`CREATE SCHEMA public AUTHORIZATION dxo_migrator`);
  } finally {
    await sql.end();
  }
}
