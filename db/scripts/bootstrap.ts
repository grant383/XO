import { bootstrapDatabase } from "../lib/bootstrap";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

await bootstrapDatabase(required("ADMIN_DATABASE_URL"), {
  app: required("DB_APP_PASSWORD"),
  auth: required("DB_AUTH_PASSWORD"),
  migrator: required("DB_MIGRATOR_PASSWORD"),
});
console.log("Database roles and grants are up to date.");
