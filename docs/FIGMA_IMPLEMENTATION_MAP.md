# DirectorXO — Figma Implementation Map

> **Purpose:** permanent bridge between the canonical Figma design and the DirectorXO codebase.  
> **Source of truth for product behaviour/routes:** `DIRECTORXO_PRODUCT_SPEC.md`  
> **Source of truth for visual implementation:** Figma file `rqWc0iFUFSTdudXuO4Gm47` (`Director-xo`)  
> **Canonical Figma root:** `0:1`  
> **Working branch when this map was created:** `p0/foundation`

## Operating rule

Every implementation slice must start from the relevant row in this map and the matching section in `DIRECTORXO_PRODUCT_SPEC.md`.

For each product screen:

1. Pull the Figma design context for the exact node ID before implementing visual work.
2. Preserve the canonical route, module, permission and phase from the product spec.
3. Reuse the existing DirectorXO shell, tokens, components and patterns rather than generating an isolated Figma-to-code page.
4. Implement server-side authorization and PostgreSQL RLS independently of UI visibility.
5. Implement applicable loading, empty, error, denied and offline states.
6. Add responsive desktop/tablet/mobile behaviour and WCAG 2.2 AA checks.
7. Add unit/integration/RLS/E2E coverage appropriate to the slice.
8. Commit each coherent slice separately and update this map in the same commit.

Do **not** treat exported/generated Figma code as the application architecture. Figma is the visual specification; GitHub is the implementation source of truth.

## Status legend

- **COMPLETE** — implementation is evidenced in the current `p0/foundation` branch and/or manually exercised.
- **VERIFY** — required by the current phase but completion must be checked against code/tests before being marked complete.
- **NOT STARTED** — later-phase product work; do not implement early unless the product spec sequencing changes.
- **DEPRECATED** — legacy design; no new feature work.
- **REFERENCE** — design/specification/supporting frame, not a customer product route.

---

## A. Canonical product screens

| Figma node | Screen | Canonical route | Module | Permission | Phase | Status |
|---|---|---|---|---|---|---|
| `31:3441` | DirectorXO login | `/auth/login` | Auth | Public | P0 | COMPLETE |
| `31:3549` | Login error | `/auth/login/error` | Auth | Public | P0 | COMPLETE |
| `31:3503` | Forgot password | `/auth/forgot-password` | Auth | Public | P0 | COMPLETE |
| `33:3315` | Set new password | `/auth/reset-password` | Auth | Valid token | P0 | COMPLETE |
| `33:3202` | Create account | `/auth/register` | Auth | Public | P0 | COMPLETE |
| `33:3266` | Verify email | `/auth/verify-email` | Auth | Valid token | P0 | COMPLETE |
| `54:27145` | MFA challenge / setup / recovery | `/auth/mfa` | Auth | Authenticated / MFA pending | P0 | COMPLETE |
| `54:27222` | Session expired | `/auth/session-expired` | Auth | Public | P0 | COMPLETE |
| `54:27280` | Password reset success | `/auth/reset-password/success` | Auth | Public | P0 | COMPLETE |
| `33:3378` | Business setup onboarding | `/onboarding/[ventureId]/business` | Onboarding | Owner | P0 | COMPLETE |
| `33:3447` | Connect business data onboarding | `/onboarding/[ventureId]/data-connections` | Onboarding | Owner | P0 | COMPLETE |
| `39:164` | Review and confirm onboarding | `/onboarding/[ventureId]/review` | Onboarding | Owner | P0 | COMPLETE |
| `54:27078` | Accept team invitation | `/invite/[token]` | Memberships | Invited verified user | P0 | COMPLETE |
| `54:27340` | Request access | `/v/[ventureId]/request-access` | Memberships | Authenticated | P0 | COMPLETE |
| `54:27489` | Access request submitted | same route; submitted state | Memberships | Authenticated | P0 | COMPLETE |
| `8:651` | **Command Centre** | `/v/[ventureId]/command` | Command | Viewer+ | **P1** | **NOT STARTED — NEXT CORE PRODUCT** |
| `29:1087` | £1M Growth Command | `/v/[ventureId]/command/growth-1m` | Command | Viewer+ | P1 | NOT STARTED |
| `3:255` | DirectorXO dashboard | legacy redirect to Command | Legacy | Viewer+ | Deprecated | DEPRECATED |
| `10:847` | Idea Lab | `/v/[ventureId]/build/ideas` | Build | Operator+ | P2 | NOT STARTED |
| `10:1429` | Market Research | `/v/[ventureId]/build/market-research` | Build | Operator+ | P2 | NOT STARTED |
| `10:4668` | Goal Architect | `/v/[ventureId]/build/goals` | Build | Manager+ | P2 | NOT STARTED |
| `8:264` | Reverse Blueprint | `/v/[ventureId]/build/reverse-blueprint` | Build | Manager+ | P2 | NOT STARTED |
| `8:849` | Launch Control | `/v/[ventureId]/build/launch-control` | Build | Operator+ | P2 | NOT STARTED |
| `8:1094` | Funding Waterfall | `/v/[ventureId]/build/funding-waterfall` | Build | Manager+ | P2 | NOT STARTED |
| `8:1479` | Financial Model P&L | `/v/[ventureId]/build/financial-model` | Build | Manager+ | P2 | NOT STARTED |
| `10:4` | Marketing Plan | `/v/[ventureId]/build/marketing` | Build | Manager+ | P2 | NOT STARTED |
| `10:257` | Sales Plan | `/v/[ventureId]/build/sales` | Build | Manager+ | P2 | NOT STARTED |
| `10:530` | Operations and Team | `/v/[ventureId]/build/operations-team` | Build | Manager+ | P2 | NOT STARTED |
| `10:1109` | Risk Register | `/v/[ventureId]/build/risks` | Build | Operator+ | P2 | NOT STARTED |
| `10:1703` | Compliance and Legal | `/v/[ventureId]/build/compliance` | Build | Manager+ | P2 | NOT STARTED |
| `10:2067` | Assets and Equipment | `/v/[ventureId]/build/assets` | Build | Operator+ | P2 | NOT STARTED |
| `10:2366` | Systems and Technology | `/v/[ventureId]/build/systems` | Build | Manager+ | P2 | NOT STARTED |
| `10:2842` | People and HR | `/v/[ventureId]/build/people` | Build | Manager+ | P2 | NOT STARTED |
| `10:3179` | Operate Finance | `/v/[ventureId]/operate/finance` | Operate | Viewer+ | P1 | NOT STARTED |
| `10:3462` | Operate Operations | `/v/[ventureId]/operate/operations` | Operate | Operator+ | P1 | NOT STARTED |
| `10:3734` | Operate Growth | `/v/[ventureId]/operate/growth` | Operate | Operator+ | P1 | NOT STARTED |
| `10:4344` | Operate Technology | `/v/[ventureId]/operate/technology` | Operate | Operator+ | P1 | NOT STARTED |
| `14:4` | Client CRM | `/v/[ventureId]/operate/crm` | Operate | Operator+ | P1 | NOT STARTED |
| `14:438` | Scheduling Calendar | `/v/[ventureId]/operate/schedule` | Operate | Operator+ | P1 | NOT STARTED |
| `14:740` | Quoting and Invoicing | `/v/[ventureId]/operate/billing` | Operate | Operator+ | P1 | NOT STARTED |
| `14:1060` | Forecast vs Actual | `/v/[ventureId]/operate/forecast-vs-actual` | Operate | Viewer+ | P1 | NOT STARTED |
| `14:1766` | AI Copilot | `/v/[ventureId]/intelligence/copilot` | Intelligence | Viewer+ | P2 | NOT STARTED |
| `8:1303` | Portfolio Command | `/portfolio/command` | Portfolio | Portfolio Viewer+ | P3 | NOT STARTED |
| `10:3942` | Venture Pipeline | `/portfolio/ventures` | Portfolio | Portfolio Manager+ | P3 | NOT STARTED |
| `10:4165` | Capital Allocation | `/portfolio/capital-allocation` | Portfolio | Portfolio Manager+ | P3 | NOT STARTED |
| `33:3534` | Profile and Security | `/settings/profile-security` | System | Authenticated | P0 | COMPLETE |
| `33:3712` | Team and Permissions | `/v/[ventureId]/settings/team` | System | Admin+ | P0 | COMPLETE |
| `33:3910` | Notifications and Activity | `/settings/notifications-activity` | System | Authenticated | P0 | VERIFY |
| `33:4087` | Billing and Subscription | `/settings/billing` | System | Owner | P0 | VERIFY |
| `33:4290` | Help and Support | `/support` | System | Authenticated | P0 | VERIFY |
| `14:1443` | Settings Integrations | `/v/[ventureId]/settings/integrations` | System | Admin+ | P1 | NOT STARTED |
| `31:3604` | 404 | `/errors/404` | State | Public | P0 | COMPLETE |
| `33:4456` | 403 | `/errors/403` | State | Public | P0 | COMPLETE |
| `31:3692` | 500 | `/errors/500` | State | Public | P0 | COMPLETE |
| `31:3787` | Empty Growth | growth empty state | State | Viewer+ | P1 | NOT STARTED |
| `31:3892` | Offline Growth | growth offline state | State | Viewer+ | P1 | NOT STARTED |

---

## B. Shell, responsive and shared-state design references

| Figma node | Reference | Status / usage |
|---|---|---|
| `54:24284` | Component/App Shell / Desktop | COMPLETE — canonical desktop shell |
| `54:24285` | Component/App Shell / Tablet | COMPLETE — canonical tablet shell |
| `54:24286` | Component/App Shell / Mobile | COMPLETE — canonical mobile shell |
| `54:24043` | App Shell / Responsive Behaviour | COMPLETE — behaviour reference |
| `54:27792` | Application loading state | COMPLETE / verify route coverage |
| `54:27962` | Generic empty state | COMPLETE / reusable state |
| `54:27638` | Creating workspace | COMPLETE — onboarding UX state |
| `54:27717` | Onboarding complete | COMPLETE — onboarding UX state |

---

## C. Technical specification frames

These frames support implementation and are **not customer navigation**.

| Figma node | Technical specification | Internal route | Phase | Status |
|---|---|---|---|---|
| `19:4` | System architecture | `/internal/specs/system-architecture` | P0 | REFERENCE |
| `19:205` | Intelligence architecture | `/internal/specs/intelligence-architecture` | P2 | REFERENCE |
| `19:614` | Data model | `/internal/specs/data-model` | P0 | REFERENCE |
| `19:1684` | API integrations | `/internal/specs/api-integrations` | P1 | REFERENCE |
| `19:2078` | Infrastructure security | `/internal/specs/infrastructure-security` | P0 | REFERENCE |
| `19:2323` | Development roadmap | `/internal/specs/development-roadmap` | P0 | REFERENCE |

Additional implementation/spec frames discovered in Figma:

| Figma node | Frame | Usage |
|---|---|---|
| `54:29298` | Master Implementation Matrix | Master delivery cross-reference |
| `50:9839` | Product architecture | Product architecture reference |
| `50:9967` | Auth, onboarding, system, and state matrix | P0 matrix |
| `50:10242` | Command and Build matrix | Command / Build matrix |
| `50:10477` | Operate, Intelligence, and Portfolio matrix | Later-module matrix |
| `50:10656` | Data, API, permissions, and integrations | Backend/integration reference |
| `50:10936` | Deterministic forecast specification | Forecasting source of truth |
| `50:11138` | Contradictions, decisions, and missing-screen backlog | Resolve before implementation where applicable |
| `50:11331` | Delivery roadmap and definition of done | Release sequencing / gates |

---

## D. Design system and product-pattern references

These are visual implementation references, not product routes.

| Figma node | Frame |
|---|---|
| `54:15162` | DirectorXO Foundations v2 |
| `54:15538` | DirectorXO Controls v2 |
| `54:15959` | DirectorXO Product Patterns v2 |
| `39:457` | DirectorXO UI foundations |
| `3:131` | director-xo-branding |
| `4:5` | logo-explorations |
| `4:229` | color-system |
| `4:516` | typography-system |
| `4:678` | graphic-language-specification |
| `5:5` | graphic-language-application |
| `5:173` | brand-applications |
| `5:434` | final-brand-board |

Before implementing a new screen, inspect the relevant shared components/tokens first. New pages should look like DirectorXO, not standalone generated Figma exports.

---

## E. P0 implementation evidence currently visible on `p0/foundation`

Recent commits at the time this map was created include:

- `c15c8f5` — Profile & Security with MFA set-up and device management
- `fbb5a55` — MFA challenge, session expired and reset success screens
- `50ddcc9` — TOTP MFA, recovery codes and device listing backend
- `e97ab34` — ADR for app shell and journey E2E
- `46ccc55` — Playwright journeys for onboarding, invitations, access and shell
- `e1e8062` — 403, 404 and 500 states
- `49fc24e` — Team and Permissions
- `4d06de9` — global application shell and venture switcher
- `3d0de1d` — empty and loading state components
- `384dcae` — request-access card and submitted state

The app has also been manually opened locally and the authenticated GS Appliance Ltd venture shell is reachable.

### P0 items that must be verified before declaring the phase closed

The Figma/product-spec matrix still requires an explicit code/test check for:

- Notifications and Activity — `33:3910`
- Billing and Subscription — `33:4087`
- Help and Support — `33:4290`
- any remaining P0 observability / rollback / API-documentation exit criteria from the master definition of done
- full local manual navigation through the completed P0 routes

Do not mark these COMPLETE merely because the shell renders.

---

## F. Next implementation order

Claude (or any implementation agent) must **re-read the current branch and product spec before changing this order**.

### Gate 1 — Close P0 honestly

1. Check the three P0 screens currently marked **VERIFY**.
2. Check the P0 exit criteria against the master implementation matrix and `DIRECTORXO_PRODUCT_SPEC.md`.
3. Implement only genuinely missing P0 requirements.
4. Run the full verification gate and update this map.

### Gate 2 — Start visible product delivery

Once P0 is closed, the first core P1 slice is:

**Command Centre — Figma `8:651` → `/v/[ventureId]/command`**

Before coding:

- load the exact Figma design context for `8:651`;
- inspect shared design references `54:15162`, `54:15538`, `54:15959`;
- inspect existing app-shell components;
- inspect the Command/Build matrix `50:10242`;
- identify the data contracts required by the Command Centre;
- implement the page as a real venture-scoped module, not a static mock.

Then continue through P1 according to the canonical spec and dependency order, updating this map after every slice.

---

## G. Definition-of-done guardrail

A screen is not complete merely because it visually matches Figma.

Where applicable, completion requires:

- canonical routing, redirects and deep links;
- server-enforced permissions;
- PostgreSQL RLS isolation tests;
- keyboard/focus/contrast/labels/responsive behaviour;
- loading, empty, error, denied and offline states;
- replay-safe integrations with dedupe/retries/sync logs;
- complete audit records for privileged mutations and decisions;
- deterministic formula fixtures for forecasts/financial calculations;
- current API contracts/examples/errors/permissions;
- logs, metrics, traces, alerts, request IDs and integration health;
- deployment and data-migration rollback readiness.

These requirements come from the DirectorXO delivery/definition-of-done specification and remain release-blocking where applicable.

---

## H. Figma link

Canonical design file:

`https://www.figma.com/design/rqWc0iFUFSTdudXuO4Gm47/Director-xo?node-id=0-1`

When handing work to an agent, provide the **node ID from this map**, not only the root file URL. This prevents implementation from drifting to the wrong frame.

## I. Current P0 audit

See [P0 audit](P0_AUDIT.md) for the 6 October 2026 code audit. Notifications, Billing and Support are confirmed missing, not completed slices. P0 remains open; deployment/rollback, recovery, API documentation and production telemetry evidence are outstanding. Command Centre remains gated.

### Canonical login error route — verified 6 October 2026

`/auth/login/error` now reuses the existing Figma sign-in form with its non-enumerating error state. Real retry retains a validated return path. Desktop/mobile Playwright and axe checks pass (`tests/e2e/login-error.spec.ts`); no completed auth slice was rebuilt.
