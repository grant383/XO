import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { format } from "prettier";
import { supportInput, supportCursor } from "../src/modules/support/policy";

const requestSchema = z.object({
  id: z.uuid(),
  subject: z.string(),
  description: z.string(),
  status: z.enum(["open", "waiting", "resolved", "closed"]),
  createdAt: z.iso.datetime(),
});
const errorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), correlationId: z.uuid() }),
});
const json = (schema: object) => ({ content: { "application/json": { schema } } });
const error = {
  description: "Machine-readable error; x-correlation-id matches the body",
  ...json({ $ref: "#/components/schemas/Error" }),
};
const errors = Object.fromEntries([400, 401, 403, 409, 413, 429, 500].map((s) => [s, error]));
const document = {
  openapi: "3.1.0",
  info: {
    title: "DirectorXO account APIs",
    version: "1.0.0",
    description:
      "Support API contract. Existing identity and venture server-action coverage remains tracked in docs/P0_AUDIT.md.",
  },
  servers: [{ url: "/" }],
  security: [{ sessionCookie: [] }],
  paths: {
    "/api/v1/support": {
      get: {
        summary: "List the signed-in account's support requests",
        description:
          "Newest first, then UUID descending; 20 per page. Both cursor fields are required together. RLS restricts results to the requester. No venture or support impersonation access is granted.",
        parameters: Object.entries(z.toJSONSchema(supportCursor).properties!).map(
          ([name, schema]) => ({ name, in: "query", required: false, schema }),
        ),
        responses: {
          "200": {
            description: "Requests and the next page cursor",
            ...json(
              z.toJSONSchema(
                z.object({ items: z.array(requestSchema), nextCursor: supportCursor.nullable() }),
              ),
            ),
          },
          ...errors,
        },
      },
      post: {
        summary: "Submit an account support request",
        description:
          "Requires the authenticated session and an Origin matching APP_URL. requestId is the idempotency key: an identical retry returns the same request; different content returns 409. 20 submissions per account per hour. Audit and request creation are atomic. No notification email or support SLA is claimed.",
        parameters: [
          {
            name: "Origin",
            in: "header",
            required: true,
            schema: { type: "string", format: "uri" },
          },
        ],
        requestBody: { required: true, ...json(z.toJSONSchema(supportInput)) },
        responses: {
          "200": {
            description: "Created request or identical retry",
            ...json(z.toJSONSchema(z.object({ data: requestSchema }))),
          },
          ...errors,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      sessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "better-auth.session_token",
        description:
          "Opaque database-backed Better Auth session; secure deployments use the __Secure- cookie prefix.",
      },
    },
    schemas: { Error: z.toJSONSchema(errorSchema) },
  },
};
const output = await format(JSON.stringify(document), { parser: "json", printWidth: 100 });
const file = "docs/api/openapi.json";
if (process.argv.includes("--check")) {
  if (readFileSync(file, "utf8") !== output)
    throw new Error("OpenAPI drift: run pnpm api:generate");
} else writeFileSync(file, output);
