# DirectorXO

DirectorXO is a multi-tenant business operating system for founders, operators, and venture portfolios.

## Canonical sources

- `DIRECTORXO_PRODUCT_SPEC.md` — product and engineering source of truth.
- DirectorXO Figma file — visual and interaction source of truth.
- `CLAUDE.md` — implementation rules for Claude Code.
- `docs/ARCHITECTURE_DECISIONS.md` — architecture decision record index.

## Build order

1. P0 Foundation
2. P1 Command & Operate Core
3. P2 Build & Intelligence
4. P3 Portfolio & Scale
5. P4 ML Data Maturity only when entry criteria are met

Do not skip phase exit criteria.

## Core principles

- Modular monolith first.
- PostgreSQL row-level security for venture isolation.
- Server-side authorization; UI checks are advisory only.
- Deterministic/statistical forecasting before ML.
- Auditable decisions and data provenance.
- No secrets committed to the repository.

## Local development

Prerequisites: Node.js 24 LTS (≥ 22.12 works), Corepack (`corepack enable`), Docker.

```bash
cp .env.example .env.local          # then set AUTH_SECRET / ENCRYPTION_KEY (openssl rand -base64 32)
pnpm install
docker compose up -d                # postgres, redis, s3 emulator, mailpit (localhost-only ports)
pnpm db:bootstrap                   # create least-privilege roles (idempotent)
pnpm db:migrate
pnpm dev
pnpm worker                         # email delivery (BullMQ, ADR-0023); separate terminal
```

| Command | Purpose |
|---|---|
| `pnpm test` | Unit tests |
| `pnpm test:db` | RLS + integration tests (rebuilds `directorxo_test` from scratch) |
| `pnpm typecheck` / `pnpm lint` / `pnpm format:check` | Static checks |
| `pnpm db:generate` | Generate table DDL migration from `src/platform/db/schema` |
| `pnpm drizzle-kit generate --custom --name=<name>` | Hand-written SQL migration (roles, grants, RLS) |

Mail UI: http://localhost:58025 · Health: `/api/health/live`, `/api/health/ready`.

See `docs/adr/0007-database-roles-and-rls.md` before adding any table.
