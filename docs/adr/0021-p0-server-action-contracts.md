# ADR-0021 — Server-action contracts for P0 venture, onboarding and membership APIs

- Status: Accepted
- Date: 2026-10-07

## Context

Spec §14 lists API groups that are versioned under `/api/v1` and documented in OpenAPI. In P0, auth (Better Auth), support, notifications, billing and the Stripe webhook are REST route handlers with a CI-checked OpenAPI contract. Venture creation, onboarding, team management, invitation acceptance and access requests are Next.js Server Actions that call the same module services (ADR-0006). Matrix design-sync item 13 recorded REST coverage for these groups as outstanding. `docs/api/SERVER_ACTIONS.md` says not to build replacement implementations.

## Decision

For P0, the checked-in Server Action contracts are the API contract for the Ventures, Onboarding and Memberships groups. No duplicate `/api/v1` REST endpoints are created for them.

- `docs/api/server-actions.json` is generated from the exported `"use server"` functions. CI (`pnpm api:check`) rejects inventory or signature drift, as it does for `docs/api/openapi.json`.
- `docs/api/SERVER_ACTIONS.md` documents inputs, results, authority and safeguards per surface.
- Server actions and route handlers share one authorization path: every action re-authenticates from server cookies, and the domain module resolves membership and capability again inside an RLS transaction (ADR-0006, ADR-0013).
- Action identifiers are build-specific framework transport, not a public, stable API. No external P0 client needs one.

A versioned REST endpoint for one of these groups is added when a real non-browser consumer needs it (for example P1 integrations or P3 portfolio clients). It must call the same module function and appear in the OpenAPI contract.

## Alternatives considered

Duplicate REST endpoints now. Rejected: there is no consumer, and every extra surface needs its own CSRF, rate-limit, error and contract tests over the same logic.

## Consequences

Design-sync item 13 is closed for P0. Spec §14 requirements that apply to these actions still hold: server-side authorization, idempotency for retried creation, optimistic concurrency on membership changes, and audit events. No migration is involved.
