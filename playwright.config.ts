import { defineConfig, devices } from "@playwright/test";

/**
 * E2E (spec §22): runs against a dedicated dev server on :3100 with APP_URL pointing at it,
 * so Better Auth origin checks pass. Requires the local stack (docker compose) and a
 * bootstrapped, migrated database.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  // One worker: every journey shares a single dev server, which runs out of memory on small
  // machines and CI runners when several browsers compile routes at once.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  // Journeys span several server actions and, on a cold dev server, first compiles.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: `pnpm exec next dev -p ${PORT}`,
      url: `${baseURL}/api/health/live`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { APP_URL: baseURL, NEXT_DIST_DIR: ".next-e2e" },
    },
    // Identity email is delivered by the worker from the BullMQ outbox (ADR-0023).
    { command: "pnpm worker", wait: { stdout: /worker started/ }, timeout: 60_000 },
  ],
});
