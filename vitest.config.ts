import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";
import { testDatabaseUrls } from "./tests/helpers/test-env.ts";

if (existsSync(".env.local") && !process.env.CI) process.loadEnvFile(".env.local");

const alias = { "@": path.resolve(import.meta.dirname, "src") };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.{ts,tsx}", "tests/contract/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        // Integration + RLS suites share one disposable database, reset once per run.
        resolve: { alias },
        test: {
          name: "db",
          include: ["tests/integration/**/*.test.ts", "tests/rls/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/setup/global-db.ts"],
          setupFiles: ["tests/setup/email-outbox.ts"],
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
          env: process.env.TEST_ADMIN_DATABASE_URL ? testDatabaseUrls() : {},
        },
      },
    ],
  },
});
