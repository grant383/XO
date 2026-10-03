import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("environment validation", () => {
  it("reports missing variable names without exposing values", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://dxo_app:super-secret@localhost:5432/db");
    vi.stubEnv("AUTH_DATABASE_URL", "");
    const { databaseEnv } = await import("@/platform/config/env");
    expect(() => databaseEnv()).toThrow(/AUTH_DATABASE_URL/);
    expect(() => databaseEnv()).not.toThrow(/super-secret/);
  });

  it("rejects non-PostgreSQL URLs", async () => {
    vi.stubEnv("DATABASE_URL", "mysql://localhost/db");
    vi.stubEnv("AUTH_DATABASE_URL", "postgresql://localhost/db");
    const { databaseEnv } = await import("@/platform/config/env");
    expect(() => databaseEnv()).toThrow(/DATABASE_URL/);
  });

  it("applies defaults", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/db");
    vi.stubEnv("AUTH_DATABASE_URL", "postgres://localhost/db");
    vi.stubEnv("DB_POOL_MAX", "");
    const { databaseEnv } = await import("@/platform/config/env");
    expect(databaseEnv().DB_POOL_MAX).toBe(10);
  });
});
