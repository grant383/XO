import { z } from "zod";

/**
 * Lazily validated, memoised environment groups. Each runtime surface validates only
 * what it uses, so `next build` does not require production secrets. Error messages
 * list variable names only, never values.
 */
function defineEnv<S extends z.ZodObject>(schema: S): () => z.infer<S> {
  let cached: z.infer<S> | undefined;
  return () => {
    if (cached) return cached;
    // Empty values (e.g. `KEY=` in an env file) are treated as unset so defaults apply.
    const source = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
    const parsed = schema.safeParse(source);
    if (!parsed.success) {
      const names = [...new Set(parsed.error.issues.map((i) => i.path.join(".")))];
      throw new Error(`Invalid or missing environment variables: ${names.join(", ")}`);
    }
    cached = parsed.data;
    return cached;
  };
}

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ });

export const appEnv = defineEnv(
  z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url(),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  }),
);

export const databaseEnv = defineEnv(
  z.object({
    DATABASE_URL: postgresUrl,
    AUTH_DATABASE_URL: postgresUrl,
    DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  }),
);

export const redisEnv = defineEnv(
  z.object({
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  }),
);
