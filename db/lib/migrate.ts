import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import postgres from "postgres";

export const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, "../migrations");

/** Applies pending migrations in a single transaction as the schema-owner role. */
export async function runMigrations(migrationUrl: string) {
  const sql = postgres(migrationUrl, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await sql.end();
  }
}
