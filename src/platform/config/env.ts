import { z } from "zod";

/**
 * Lazily validated, memoised environment groups. Each runtime surface validates only
 * what it uses, so `next build` does not require production secrets. Error messages
 * list variable names only, never values.
 */
function defineEnv<S extends z.ZodType>(schema: S): () => z.infer<S> {
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

export const authEnv = defineEnv(
  z
    .object({
      NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
      APP_URL: z.url(),
      /** Signs session cookies and verification tokens. Rotate via ADR-0009 procedure. */
      AUTH_SECRET: z.string().min(32),
    })
    // Secure cookies require TLS: production must be served over https.
    .refine((env) => env.NODE_ENV !== "production" || env.APP_URL.startsWith("https://"), {
      path: ["APP_URL"],
      message: "production requires an https APP_URL",
    }),
);

/**
 * Transactional email. `smtp` targets Mailpit locally; `sendgrid` is used in staging and
 * production; `memory` captures messages in-process for automated tests only.
 */
export const emailEnv = defineEnv(
  z
    .discriminatedUnion("EMAIL_PROVIDER", [
      z.object({
        EMAIL_PROVIDER: z.literal("smtp"),
        SMTP_URL: z.url({ protocol: /^smtps?$/ }),
      }),
      z.object({
        EMAIL_PROVIDER: z.literal("sendgrid"),
        SENDGRID_API_KEY: z.string().min(20),
      }),
      z.object({ EMAIL_PROVIDER: z.literal("memory") }),
    ])
    .and(
      z.object({
        NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
        EMAIL_FROM: z.string().min(3),
      }),
    )
    .refine((env) => !(env.NODE_ENV === "production" && env.EMAIL_PROVIDER !== "sendgrid"), {
      path: ["EMAIL_PROVIDER"],
      message: "production requires EMAIL_PROVIDER=sendgrid",
    }),
);

/** Companies House lookup is optional: without a key, onboarding proceeds manually. */
export const companiesHouseEnv = defineEnv(
  z.object({
    COMPANIES_HOUSE_API_KEY: z.string().min(10).optional(),
    COMPANIES_HOUSE_API_URL: z.url({ protocol: /^https?$/ }).optional(),
  }),
);

/** A base64-encoded 256-bit key (`openssl rand -base64 32`). */
const aes256Key = z
  .string()
  .refine((v) => /^[A-Za-z0-9+/]+={0,2}$/.test(v) && Buffer.from(v, "base64").length === 32, {
    message: "must be 32 bytes, base64-encoded",
  });

/**
 * Application-level encryption for data at rest outside PostgreSQL (e.g. queued email
 * payloads, ADR-0023). `ENCRYPTION_KEY_PREVIOUS` is set only while rotating keys, so data
 * sealed with the old key can still be opened (ADR-0023, key rotation).
 */
export const encryptionEnv = defineEnv(
  z.object({
    ENCRYPTION_KEY: aes256Key,
    ENCRYPTION_KEY_PREVIOUS: aes256Key.optional(),
  }),
);
