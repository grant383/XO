import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { format } from "prettier";
import { generateAuthContract } from "./auth-openapi";
import { generateActionContract } from "./action-contract";
import { billingCommand } from "../src/modules/billing/policy";
import { inboxQuery, readInput } from "../src/modules/notifications/policy";
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
      "Configured identity HTTP endpoints, Support, Notifications, Billing and operational health contracts. Existing Next.js Server Action signatures are inventoried separately in server-actions.json with behavioral/permission notes in SERVER_ACTIONS.md.",
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
const notification = z.object({
  id: z.uuid(),
  action: z.string(),
  createdAt: z.iso.datetime(),
  readAt: z.iso.datetime().nullable(),
});
const ventureEvent = z.object({
  id: z.uuid(),
  action: z.string(),
  outcome: z.enum(["success", "failure", "denied"]),
  occurredAt: z.iso.datetime(),
});
const paths = document.paths as Record<string, unknown>;
paths["/api/v1/notifications"] = {
  get: {
    summary: "Read account notifications or authorised venture audit activity",
    description:
      "Account inbox: authenticated self only, newest timestamp then UUID descending, 30 per page, no audit metadata. With ventureId: active Owner/Admin required independently by the server and audit RLS; inaccessible and unknown ventures return the same 403. Venture activity returns the latest 30 records. New account audit events are projected from migration 0011 onward; historical audit logs remain unchanged.",
    parameters: [
      { name: "unread", in: "query", schema: { type: "string", enum: ["0", "1"] } },
      { name: "ventureId", in: "query", schema: { type: "string", format: "uuid" } },
      { name: "at", in: "query", schema: { type: "string", format: "date-time" } },
      { name: "id", in: "query", schema: { type: "string", format: "uuid" } },
    ],
    responses: {
      "200": {
        description: "Own inbox or permitted venture activity",
        ...json({
          oneOf: [
            z.toJSONSchema(
              z.object({
                items: z.array(notification),
                total: z.number().int(),
                unread: z.number().int(),
                thisWeek: z.number().int(),
                asOf: z.iso.datetime(),
                nextCursor: inboxQuery.shape.cursor.unwrap().nullable(),
              }),
            ),
            z.toJSONSchema(z.object({ items: z.array(ventureEvent) })),
          ],
        }),
      },
      ...errors,
    },
  },
  post: {
    summary: "Mark own notifications read through a displayed cutoff",
    description:
      "Explicit POST, exact Origin and authenticated account required. An optional id marks one notification; omitted id marks all through the cutoff. Other accounts' IDs update zero records. Future cutoffs are rejected. Retries are harmless.",
    requestBody: { required: true, ...json(z.toJSONSchema(readInput)) },
    responses: {
      "200": {
        description: "Number of records updated",
        ...json(z.toJSONSchema(z.object({ updated: z.number().int().nonnegative() }))),
      },
      ...errors,
    },
  },
};
const billingSubscription = z.object({
  status: z.string(),
  priceId: z.string(),
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  interval: z.string(),
  intervalCount: z.number().int().positive(),
  periodEnd: z.iso.datetime(),
  cancelAtPeriodEnd: z.boolean(),
  syncedAt: z.iso.datetime(),
});
paths["/api/v1/billing"] = {
  get: {
    summary: "Read owned billing accounts or a subscription overview",
    description:
      "Active billing-account owner membership is required, independently of venture roles. Omitting accountId returns owned accounts; supplying it returns the selected overview and only independently visible venture entitlements. Subscription state is a provider-confirmed local mirror, never activated by a checkout return URL.",
    parameters: [{ name: "accountId", in: "query", schema: { type: "string", format: "uuid" } }],
    responses: {
      "200": {
        description: "Owned accounts or selected billing overview",
        ...json({
          oneOf: [
            z.toJSONSchema(
              z.object({ accounts: z.array(z.object({ id: z.uuid(), name: z.string() })) }),
            ),
            z.toJSONSchema(
              z.object({
                account: z.object({ id: z.uuid(), name: z.string(), hasCustomer: z.boolean() }),
                subscription: billingSubscription.nullable(),
                configured: z.boolean(),
                entitlements: z.array(
                  z.object({ ventureId: z.uuid(), name: z.string(), enabled: z.boolean() }),
                ),
              }),
            ),
          ],
        }),
      },
      ...errors,
    },
  },
  post: {
    summary: "Open subscription checkout or secure billing management",
    description:
      "Exact Origin and active billing owner required. requestId is a command idempotency UUID. The server chooses the configured price and stored customer; client-supplied provider identifiers are rejected. Existing open checkout is reused. Returns a validated Stripe-hosted URL for explicit navigation. Returns 503 while provider configuration is unavailable.",
    requestBody: { required: true, ...json(z.toJSONSchema(billingCommand)) },
    responses: {
      "200": {
        description: "Secure Stripe session",
        ...json(z.toJSONSchema(z.object({ url: z.url() }))),
      },
      ...errors,
      "503": error,
    },
  },
};
paths["/api/v1/webhooks/stripe"] = {
  post: {
    summary: "Receive a signed Stripe subscription snapshot event",
    security: [],
    description:
      "Untouched body, maximum 128 KiB, valid stripe-signature and five-minute timestamp tolerance required. Supported subscription and checkout events route by stored customer, fetch fresh provider state and atomically commit subscription, entitlements, audit and unique receipt. Retries are safe. Provider/storage failures return 503 for retry. No cookie or Origin required.",
    parameters: [
      { name: "stripe-signature", in: "header", required: true, schema: { type: "string" } },
    ],
    requestBody: { required: true, ...json({ type: "object", additionalProperties: true }) },
    responses: {
      "200": {
        description: "Accepted, duplicate or ignored event",
        ...json(
          z.toJSONSchema(z.object({ status: z.enum(["processed", "duplicate", "ignored"]) })),
        ),
      },
      "400": error,
      "413": error,
      "503": error,
    },
  },
};
const auth = await generateAuthContract();
Object.assign(paths, auth.paths);
Object.assign(document.components.schemas, auth.schemas);
Object.assign(document.components.securitySchemes, {
  mfaPendingCookie: {
    type: "apiKey",
    in: "cookie",
    name: "dxo.two_factor",
    description: "Signed pending MFA challenge; production uses the __Secure- prefix.",
  },
});
paths["/api/health/live"] = {
  get: {
    summary: "Process liveness",
    security: [],
    responses: {
      "200": {
        description: "Process is serving requests; no dependency checks",
        ...json(z.toJSONSchema(z.object({ status: z.literal("ok") }))),
      },
    },
  },
};
const readiness = {
  description: "Dependency readiness; no identifiers or credentials",
  ...json(
    z.toJSONSchema(
      z.object({
        status: z.enum(["ok", "unavailable"]),
        checks: z.object({ database: z.enum(["ok", "error"]), redis: z.enum(["ok", "error"]) }),
      }),
    ),
  ),
};
paths["/api/health/ready"] = {
  get: {
    summary: "PostgreSQL and Redis readiness",
    security: [],
    responses: { "200": readiness, "503": readiness },
  },
};
const actionOutput = await format(JSON.stringify(generateActionContract()), {
  parser: "json",
  printWidth: 100,
});
const actionFile = "docs/api/server-actions.json";
if (process.argv.includes("--check")) {
  if (readFileSync(actionFile, "utf8") !== actionOutput)
    throw new Error("Server Action contract drift: run pnpm api:generate");
} else writeFileSync(actionFile, actionOutput);
const output = await format(JSON.stringify(document), { parser: "json", printWidth: 100 });
const file = "docs/api/openapi.json";
if (process.argv.includes("--check")) {
  if (readFileSync(file, "utf8") !== output)
    throw new Error("OpenAPI drift: run pnpm api:generate");
} else writeFileSync(file, output);
