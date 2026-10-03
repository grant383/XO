import { bootstrapDatabase, resetDatabaseForTests } from "../../db/lib/bootstrap";
import { runMigrations } from "../../db/lib/migrate";
import { rolePasswords, testDatabaseUrls } from "../helpers/test-env";

/** Rebuilds the test database from scratch exactly as production does: bootstrap → migrate. */
export default async function setup() {
  const urls = testDatabaseUrls();
  await bootstrapDatabase(urls.TEST_ADMIN_DATABASE_URL, rolePasswords());
  await resetDatabaseForTests(urls.TEST_ADMIN_DATABASE_URL);
  await runMigrations(urls.MIGRATION_DATABASE_URL);
}
