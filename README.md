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
