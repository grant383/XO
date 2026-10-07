import { openAPI } from "better-auth/plugins";
import { AUTH_BASE_PATH } from "../src/modules/identity/policy";
import { createIdentityAuth } from "../src/modules/identity/auth";
import { closePools } from "../src/platform/db";
import { MemoryRateLimitStore } from "../src/platform/security";

/** Offline schema-only auth instance: no production secrets or reachable database. */
export async function generateAuthContract() {
  process.env.DATABASE_URL = "postgres://openapi_fixture:unused@127.0.0.1:1/openapi_fixture";
  process.env.AUTH_DATABASE_URL = process.env.DATABASE_URL;
  const auth = createIdentityAuth({
    appUrl: "https://directorxo.openapi.invalid",
    secret: "openapi-schema-only-synthetic-secret-never-used-at-runtime",
    secureCookies: false,
    rateLimitStore: new MemoryRateLimitStore(),
  });
  try {
    const raw = await openAPI({ disableDefaultReference: true }).endpoints.generateOpenAPISchema({
      context: await auth.$context,
    });
    const publicPaths = new Set([
      "/get-session",
      "/sign-out",
      "/sign-up/email",
      "/sign-in/email",
      "/reset-password",
      "/verify-email",
      "/send-verification-email",
      "/request-password-reset",
      "/ok",
      "/error",
    ]);
    const pendingPaths = new Set(["/two-factor/verify-totp", "/two-factor/verify-backup-code"]);
    const nullTokens = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach(nullTokens);
        return;
      }
      const object = value as Record<string, unknown>;
      const properties = object.properties as Record<string, unknown> | undefined;
      if (properties && "token" in properties)
        properties.token = {
          type: "null",
          description:
            "Session tokens are carried only by the HttpOnly cookie and stripped from browser JSON.",
        };
      Object.values(object).forEach(nullTokens);
    };
    const paths = Object.fromEntries(
      Object.entries(raw.paths).map(([path, methods]) => {
        for (const [method, value] of Object.entries(methods)) {
          if (!value || typeof value !== "object") continue;
          const operation = value as Record<string, unknown>;
          operation.tags = ["Identity"];
          operation.security = publicPaths.has(path)
            ? []
            : pendingPaths.has(path)
              ? [{ sessionCookie: [] }, { mfaPendingCookie: [] }]
              : [{ sessionCookie: [] }];
          const notes =
            " DirectorXO: exact trusted Origin/CSRF enforced on mutations; configured per-IP/account limits; disabled social/refresh-token/email-OTP/account-deletion paths are omitted. Error bodies use Better Auth code/message; x-correlation-id is returned in headers. Session tokens are null in browser JSON. MFA trust-device/remember-me controls are not offered by the P0 UI.";
          operation.description = String(operation.description ?? "") + notes;
          const responses = operation.responses as
            Record<string, Record<string, unknown>> | undefined;
          if (responses) {
            nullTokens(responses);
            for (const response of Object.values(responses))
              response.headers = {
                ...((response.headers as object) ?? {}),
                "x-correlation-id": {
                  description: "Incident/request identifier; no session token",
                  schema: { type: "string", minLength: 8, maxLength: 128 },
                },
              };
          }
          if (method === "post")
            operation.parameters = [
              ...((operation.parameters as object[]) ?? []),
              {
                name: "Origin",
                in: "header",
                required: true,
                schema: { type: "string", format: "uri" },
                description: "Must match APP_URL's trusted origin.",
              },
            ];
        }
        return [AUTH_BASE_PATH + path, methods];
      }),
    );
    nullTokens(raw.components.schemas);
    return { openapi: "3.1.0", paths, schemas: raw.components.schemas };
  } finally {
    await closePools();
  }
}
