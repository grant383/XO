# ADR-0006 — Modular monolith code layout

- Status: Accepted
- Date: 2026-10-03

## Decision
Single package, two process entry points (Next.js web, BullMQ worker — worker added in P0 step 7).

```
src/app/        routes, layouts, route handlers, server actions — no business logic
src/modules/    domain modules; each exposes a public index.ts
src/platform/   infrastructure: config, db, redis, queue, email, storage, observability, security
src/ui/         design tokens and components (from approved Figma)
db/             migrations, bootstrap and migration scripts
tests/          unit, db (integration + rls), api, contract, e2e
```

Boundaries are enforced with ESLint `no-restricted-imports` (`eslint.config.mjs`):
- `platform/*` never imports `modules/*` or `app/*`.
- Code outside a module imports it only through `@/modules/<name>`.
- Raw database pools (`src/platform/db/internal`) are importable only inside `src/platform/db`; all data access goes through `withUser` / `withTenant` / `withService`.

UI mutations use Server Actions that call the same module services and authorization checks as `/api/v1` route handlers — one authorization path.

## Alternatives considered
pnpm workspace with per-module packages (more ceremony, no isolation benefit at this size); `eslint-plugin-boundaries` (v7 API churn; built-in rule is sufficient).
