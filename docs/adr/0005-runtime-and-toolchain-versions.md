# ADR-0005 — Runtime and toolchain versions

- Status: Accepted
- Date: 2026-10-03

## Context
Spec §11 requires confirming the supported Next.js version during P0 and recording upgrades via ADR.

## Decision
| Component | Version | Notes |
|---|---|---|
| Next.js | 16.3.8 | App Router, `output: "standalone"`, typed routes. `proxy.ts` replaces `middleware.ts`. |
| React | 19.3.0 | |
| Node.js | 24 LTS for deployed services (`.nvmrc`); `>=22.12` supported locally | |
| TypeScript | 6.0.x | 7.x (native compiler) deferred until Next.js/ESLint tooling compatibility is verified. |
| ESLint | 9.x | `eslint-plugin-react` (via `eslint-config-next`) is not yet compatible with ESLint 10. |
| pnpm | 12.9.1 via Corepack | Build scripts allowed only for `esbuild` and `unrs-resolver` (`pnpm-workspace.yaml`). |
| PostgreSQL | 18 locally/CI | Production must be ≥ 16; no 18-only features (e.g. `uuidv7()`) are used. |
| Drizzle ORM / Kit | 0.45.3 / 0.31.11 | 1.0 is still RC. |
| Better Auth | 1.7.7 | See ADR-0009. |

Exact versions are pinned in `package.json` (`-E`). Upgrades of Next.js, React, Node.js, PostgreSQL or Better Auth major/minor versions require an ADR update.

## Consequences
Dependabot proposes upgrades weekly; major upgrades are evaluated against this ADR.
