/**
 * Derives per-role connection URLs for the disposable test database from
 * TEST_ADMIN_DATABASE_URL (a superuser URL whose database name ends in `_test`).
 */
export function testDatabaseUrls() {
  const admin = process.env.TEST_ADMIN_DATABASE_URL;
  if (!admin) throw new Error("TEST_ADMIN_DATABASE_URL is required for database tests");

  const withRole = (user: string, password: string) => {
    const url = new URL(admin);
    url.username = user;
    url.password = password;
    return url.toString();
  };
  const passwords = rolePasswords();

  return {
    TEST_ADMIN_DATABASE_URL: admin,
    DATABASE_URL: withRole("dxo_app", passwords.app),
    AUTH_DATABASE_URL: withRole("dxo_auth", passwords.auth),
    MIGRATION_DATABASE_URL: withRole("dxo_migrator", passwords.migrator),
    DB_POOL_MAX: "4",
  };
}

export function rolePasswords() {
  return {
    app: process.env.DB_APP_PASSWORD ?? "local-app-password",
    auth: process.env.DB_AUTH_PASSWORD ?? "local-auth-password",
    migrator: process.env.DB_MIGRATOR_PASSWORD ?? "local-migrator-password",
  };
}
