import { defineConfig } from "drizzle-kit";

// Table DDL is generated from the TypeScript schema. Roles, grants, RLS policies and
// SECURITY DEFINER functions are hand-written SQL migrations (`drizzle-kit generate --custom`)
// so tenant security stays explicit and reviewable (ADR-0007).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/platform/db/schema/index.ts",
  out: "./db/migrations",
  dbCredentials: { url: process.env.MIGRATION_DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
