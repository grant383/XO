# ADR-0022 — Technical specifications live in version-controlled docs

- Status: Accepted
- Date: 2026-10-07

## Context

Spec §9 mapped six Figma technical-specification frames (19:4–19:2323) to internal routes under `/internal/specs/*`, four of them in P0, and §5 reserved that route prefix. The Figma implementation map treats the frames as reference material. No such routes were built, and hidden UI routes would need their own authentication, authorization and non-customer navigation rules.

## Decision

Technical specifications live in version-controlled repository documents, not application routes. DirectorXO does not build `/internal/specs/*` routes.

| Figma frame | Repository source |
|---|---|
| 19:4 System architecture | `DIRECTORXO_PRODUCT_SPEC.md` §18, ADR-0006 (layout), ADR-0010 (hosting), ADR-0023 (worker) |
| 19:614 Data model | `DIRECTORXO_PRODUCT_SPEC.md` §16, `db/migrations/`, `src/platform/db/schema/`, ADR-0007 |
| 19:2078 Infrastructure security | ADR-0007, ADR-0009, ADR-0016, ADR-0023, `docs/runbooks/` |
| 19:2323 Development roadmap | `DIRECTORXO_PRODUCT_SPEC.md` §19, `DIRECTORXO_IMPLEMENTATION_MATRIX.md` |
| 19:205 Intelligence architecture (P2) | `DIRECTORXO_PRODUCT_SPEC.md` §13 until P2 |
| 19:1684 API integrations (P1) | `DIRECTORXO_PRODUCT_SPEC.md` §17, `docs/api/` |

Spec §5 and §9 are amended accordingly. The Figma frames remain design references.

## Alternatives considered

Authenticated internal routes rendering the documents. Rejected: they duplicate the repository, add an access-control surface, and could drift from the reviewed source.

## Consequences

Specifications are reviewed through commits like code. No route, migration or runtime change is involved.
