# DirectorXO Implementation Matrix

Route-to-delivery tracker for the 60 approved DirectorXO capabilities. Rows mirror the Figma **Master Implementation Matrix** (file `rqWc0iFUFSTdudXuO4Gm47`, node `54:29298`, "Spec v1.0 · Oct 2026 · 8 domains · 60 rows"). Status reflects the repository on branch `p0/foundation` after P0 step 5.

## How to read this matrix

Precedence (CLAUDE.md, ADR-0004): `DIRECTORXO_PRODUCT_SPEC.md` governs routes, permissions and phases. The Figma matrix governs capability scope and visual handoff. Where they differ:

- the **Route** and **Required permission** columns show the spec's canonical value;
- the Figma value is recorded in **Notes**;
- every difference is listed under [Open disagreements](#open-disagreements).

A route marked *(Figma; not in spec)* is a Figma proposal that the spec does not define yet. It is not canonical until the spec adopts it.

### Status values

| Status | Meaning |
|---|---|
| **Implemented** | Meets the spec §22 definition of done, including the approved Figma visual, responsive states and Playwright E2E. |
| **Foundation** | Server logic, server-side authorisation, RLS (where data is venture-owned), audit and automated unit/integration tests are in place. UI is the **minimal functional P0 presentation only**. The Figma visual and E2E are outstanding. |
| **In progress** | Part of the capability exists (for example backend only, or an inline state instead of the specified route). The core deliverable is incomplete. |
| **Not started** | No implementation beyond shared foundations. |
| **Deferred** | Deliberately moved out of its listed phase by a recorded decision. |

No capability is **Implemented** yet: no screen has its approved Figma visual or Playwright coverage.

### Permission order (spec §7)

Public → Authenticated → Viewer+ → Operator+ → Manager+ → Admin+ → Owner. Canonical venture roles: **Owner, Admin, Manager, Operator, Viewer** (no other venture roles exist). Portfolio permissions additionally require explicit portfolio membership.

## Summary

| Domain | Rows | Foundation | In progress | Not started | Deferred |
|---|---|---|---|---|---|
| 01 Auth & Onboarding | 15 | 8 | 3 | 4 | 0 |
| 02 Command | 3 | 0 | 0 | 3 | 0 |
| 03 Build | 15 | 0 | 0 | 15 | 0 |
| 04 Operate | 8 | 0 | 0 | 8 | 0 |
| 05 Intelligence | 1 | 0 | 0 | 1 | 0 |
| 06 Portfolio | 3 | 0 | 0 | 3 | 0 |
| 07 System | 8 | 3 | 1 | 4 | 0 |
| 08 States | 7 | 0 | 4 | 3 | 0 |
| **Total** | **60** | **11** | **8** | **41** | **0** |

## 01 Auth & Onboarding

| # | Capability | Product area | Phase | Route | Figma node | Backend module | API / server action | Required permission | RLS / authorization boundary | Test requirement | Current implementation status | Notes / dependencies |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Login | Auth | P0 | `/auth/login` | 31:3441 | `identity` | `loginAction` → `identity.login` → Better Auth `POST /api/v1/auth/sign-in/email` | Public | Better Auth as `dxo_auth`; per-IP and per-account rate limits; account lockout; Origin/CSRF checks forced on (ADR-0009) | E2E + auth | Foundation | Integration-tested. Honours a validated `next` path (ADR-0013). Figma API label `POST /api/v1/auth/login` differs from the implemented Better Auth path. Figma: Ready. |
| 2 | Login error | Auth | P0 | `/auth/login/error` | 31:3549 | `identity` | as Login | Public | Identical response for unknown account and wrong password; lockout | E2E + lockout | In progress | Errors render inline on `/auth/login`; the `/auth/login/error` route does not exist. Lockout is implemented and tested. Figma: Ready. |
| 3 | Forgot password | Auth | P0 | `/auth/forgot-password` | 31:3503 | `identity` | `forgotPasswordAction` → `requestPasswordReset` → `POST /api/v1/auth/request-password-reset` | Public | Non-enumerating response; IP and account rate limits | E2E + rate limit | Foundation | Figma API label `POST /api/v1/auth/password/forgot`. Figma: Ready. |
| 4 | Set new password | Auth | P0 | `/auth/reset-password` | 33:3315 | `identity` | `resetPasswordAction` → `resetPassword` → `POST /api/v1/auth/reset-password` | Public with valid token | Hashed, single-use, 30-minute token; reset revokes all sessions | token + validation | Foundation | Token consumed only on explicit POST. Figma: Ready. |
| 5 | Create account | Auth | P0 | `/auth/register` | 33:3202 | `identity` | `registerAction` → `register` → `POST /api/v1/auth/sign-up/email` | Public | Duplicate email returns a synthetic success (no enumeration); rate limits | E2E + validation | Foundation | Carries a validated `next` (e.g. `/invite/[token]`) through the verification email. Figma API label `POST /api/v1/users`. Figma: Ready. |
| 6 | Verify email | Auth | P0 | `/auth/verify-email` | 33:3266 | `identity` | `verifyEmailAction` → `verifyEmail` → Better Auth `/api/v1/auth/verify-email` | Public with valid token | Single-use JWT recorded in `auth_consumed_tokens` | token + idempotency | Foundation | Figma lists the permission as Authenticated; spec §8 says Public with valid token, and the implementation follows the spec. Figma: Ready. |
| 7 | Accept invitation | Auth / Team | P0 | `/invite/[token]` | 54:27078 | `memberships` | `previewInvitation`; `acceptInvitationAction` → `acceptInvitation` → `app.accept_venture_invitation()` | Invited user: signed in, email verified, email equals invited address | SECURITY DEFINER function; token stored as SHA-256 digest only; atomic membership creation with audit; RLS on `venture_invitations` | E2E + auth | Foundation | ADR-0013 route (canonical). Figma route `/auth/invitations/[token]` and API `POST /api/v1/invitations/accept` are superseded (server action only). Figma: New P0. |
| 8 | MFA | Auth | P0 | `/auth/mfa` *(Figma; not in spec)* | 54:27145 | `identity` (Figma: `auth-security`) | planned: Figma `POST /api/v1/auth/mfa/verify` | Authenticated | Planned: TOTP via Better Auth (ADR-0009) | E2E + recovery | Not started | P0 MFA step (ADR-0009). `users.two_factor_enabled` exists. Spec §12 lists "MFA setup and recovery" without a route. Figma: New P0. |
| 9 | Session expired | Auth | P0 | `/auth/session-expired` *(Figma; not in spec)* | 54:27222 | `identity` (sessions) | Figma `POST /api/v1/auth/refresh` | Expired session | Idle (7 d) and absolute (30 d) expiry enforced server-side on every request | E2E + redirect | Not started | Expiry is enforced and tested; expired sessions are sent to `/auth/login` with no dedicated screen. Figma's refresh API conflicts with ADR-0009 (database sessions, no refresh tokens). Figma: New P0. |
| 10 | Password reset success | Auth | P0 | `/auth/reset-password/success` *(Figma; not in spec)* | 54:27280 | `identity` | Figma `GET /api/v1/auth/reset-status` | Public | — | E2E + auth | In progress | Success is shown inline on `/auth/reset-password`; no dedicated route. Figma: New P0. |
| 11 | Business setup | Onboarding | P0 | `/onboarding/[ventureId]/business` | 33:3378 | `ventures` | `saveBusinessAction` → `saveBusinessDetails`; `lookupCompanyAction` | Owner (`venture:onboard`) of a draft venture | `resolveVenture` with capability; RLS `venture_onboarding` owner-only update; audit | CRUD + validation | Foundation | Figma route `/onboarding/business` and permission Authenticated superseded by spec §5/§8 (venture-scoped, Owner). Figma API `PUT /api/v1/onboarding/business` not implemented. Figma: Ready. |
| 12 | Data connections | Onboarding | P0 | `/onboarding/[ventureId]/data-connections` | 33:3447 | `ventures`; Companies House adapter | `completeDataConnectionsAction` → `completeDataConnections` | Owner | As Business setup | OAuth + idempotency | In progress | Connection-status review step is implemented. Provider OAuth connect (Figma `POST /api/v1/integrations/connect`) depends on P1 integrations. Figma module `integrations`; Figma route `/onboarding/data-connections`. Figma: Ready. |
| 13 | Review onboarding | Onboarding | P0 | `/onboarding/[ventureId]/review` | 39:164 | `ventures` | `completeOnboardingAction` → `completeOnboarding` → `app.complete_venture_onboarding()` | Owner | Definer function revalidates Owner, steps and settings; draft → active only here; audit | E2E + validation | Foundation | Figma route `/onboarding/review`. Figma: Ready. |
| 14 | Creating workspace | Onboarding | P0 | `/onboarding/creating-workspace` *(Figma; not in spec)* | 54:27638 | Figma: `workspace-bootstrap` (not created) | Figma `POST /api/v1/ventures/bootstrap` | Authenticated | — | job + idempotency | Not started | Venture creation is synchronous and idempotent (`app.create_venture` with a request id) at `/onboarding`; there is no bootstrap job or progress screen. Depends on the BullMQ worker. Figma: New P0. |
| 15 | Onboarding complete | Onboarding | P0 | `/onboarding/complete` *(Figma; not in spec)* | 54:27717 | Figma: `workspace-bootstrap` (not created) | Figma `GET /api/v1/ventures/bootstrap` | Owner | — | E2E + readiness | Not started | Completion currently redirects to `/?onboarded=1`. Figma: New P0. |

## 02 Command

| # | Capability | Product area | Phase | Route | Figma node | Backend module | API / server action | Required permission | RLS / authorization boundary | Test requirement | Current implementation status | Notes / dependencies |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 16 | Command Centre | Command | P1 | `/v/[ventureId]/command` | 8:651 | `command` | `GET /api/v1/command` | Viewer+ | Venture RLS + `venture:view` | RLS + permission | Not started | Needs the app shell and venture switcher. Figma: Ready. |
| 17 | £1M Growth Command | Command | P1 | `/v/[ventureId]/command/growth-1m` | 29:1087 | `growth-command` | `GET /api/v1/growth-command` | Viewer+ | Venture RLS | formula unit + integration | Not started | Figma permission Manager+ disagrees with spec Viewer+. Deterministic formulas per spec §13.11. Figma: Ready. |
| 18 | Legacy dashboard | Command | P1 | `/dashboard` → `/v/[ventureId]/command` | 3:255 | routing | 301 redirect only | Viewer+ | Redirect resolves an accessible venture | redirect + deep link | Not started | Deprecated screen; redirect is a P1 exit criterion. Figma: Legacy/Deprecated. |

## 03 Build

All Build rows are P2 and Not started. Spec routes are canonical; the Figma route is noted where it differs.

| # | Capability | Product area | Phase | Route | Figma node | Backend module | API / server action | Required permission | RLS / authorization boundary | Test requirement | Current implementation status | Notes / dependencies |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 19 | Idea Lab | Build | P2 | `/v/[ventureId]/build/ideas` | 10:847 | `venture-planning` | `/api/v1/build/ideas` | Operator+ | Venture RLS + permission | CRUD + validation | Not started | Figma permission Manager+. Figma: Planned. |
| 20 | Market Research | Build | P2 | `/v/[ventureId]/build/market-research` | 10:1429 | `market-research` | `/api/v1/build/research` | Operator+ | Venture RLS + permission | CRUD + evidence | Not started | Figma route `/build/research`; Figma permission Manager+. Figma: Planned. |
| 21 | Goal Architect | Build | P2 | `/v/[ventureId]/build/goals` | 10:4668 | `strategy` | `/api/v1/build/goals` | Manager+ | Venture RLS + permission | CRUD + validation | Not started | Figma: Planned. |
| 22 | Reverse Blueprint | Build | P2 | `/v/[ventureId]/build/reverse-blueprint` | 8:264 | `strategy` | `/api/v1/build/blueprints` | Manager+ | Venture RLS + permission | graph unit + integration | Not started | Figma route `/build/blueprint`. Figma: Planned. |
| 23 | Launch Control | Build | P2 | `/v/[ventureId]/build/launch-control` | 8:849 | `venture-planning` | `/api/v1/build/launch` | Operator+ | Venture RLS + permission | gates + validation | Not started | Figma route `/build/launch`; Figma permission Manager+. Figma: Planned. |
| 24 | Funding Waterfall | Build | P2 | `/v/[ventureId]/build/funding-waterfall` | 8:1094 | `planning-finance` | `/api/v1/build/funding` | Manager+ | Venture RLS + permission | formula unit + integration | Not started | Figma route `/build/funding`; Figma permission Admin+. Figma: Planned. |
| 25 | Financial Model | Build | P2 | `/v/[ventureId]/build/financial-model` | 8:1479 | `planning-finance` | `/api/v1/build/financial-model` | Manager+ | Venture RLS + permission | formula unit + integration | Not started | Figma: Planned. |
| 26 | Marketing Plan | Build | P2 | `/v/[ventureId]/build/marketing` | 10:4 | `marketing-plan` | `/api/v1/build/marketing-plan` | Manager+ | Venture RLS + permission | CRUD + validation | Not started | Figma route `/build/marketing-plan`. Figma: Planned. |
| 27 | Sales Plan | Build | P2 | `/v/[ventureId]/build/sales` | 10:257 | `sales-plan` | `/api/v1/build/sales-plan` | Manager+ | Venture RLS + permission | formula + validation | Not started | Figma route `/build/sales-plan`. Must not duplicate CRM (spec §10). Figma: Planned. |
| 28 | Operations & Team | Build | P2 | `/v/[ventureId]/build/operations-team` | 10:530 | `operations-plan` | `/api/v1/build/operations-plan` | Manager+ | Venture RLS + permission | CRUD + capacity | Not started | Figma route `/build/operations-plan`. Figma: Planned. |
| 29 | Risk Register | Build | P2 | `/v/[ventureId]/build/risks` | 10:1109 | `risk` | `/api/v1/build/risks` | Operator+ | Venture RLS + permission | CRUD + scoring | Not started | Figma permission Manager+. Figma: Planned. |
| 30 | Compliance | Build | P2 | `/v/[ventureId]/build/compliance` | 10:1703 | `compliance` | `/api/v1/build/compliance` | Manager+ | Venture RLS + permission | CRUD + audit | Not started | Figma permission Admin+. Figma: Planned. |
| 31 | Assets | Build | P2 | `/v/[ventureId]/build/assets` | 10:2067 | `asset-plan` | `/api/v1/build/assets` | Operator+ | Venture RLS + permission | CRUD + validation | Not started | Figma permission Manager+. Figma: Planned. |
| 32 | Systems | Build | P2 | `/v/[ventureId]/build/systems` | 10:2366 | `systems-plan` | `/api/v1/build/systems` | Manager+ | Venture RLS + permission | CRUD + dependencies | Not started | Figma permission Admin+. Figma: Planned. |
| 33 | People | Build | P2 | `/v/[ventureId]/build/people` | 10:2842 | `people-plan` | `/api/v1/build/people` | Manager+ | Venture RLS + permission | CRUD + permission | Not started | Figma: Planned. |

## 04 Operate

| # | Capability | Product area | Phase | Route | Figma node | Backend module | API / server action | Required permission | RLS / authorization boundary | Test requirement | Current implementation status | Notes / dependencies |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 34 | Finance | Operate | P1 | `/v/[ventureId]/operate/finance` | 10:3179 | `finance` | `/api/v1/finance` | Viewer+ | Venture RLS + permission | RLS + permission | Not started | Depends on Xero (P1). Viewer access may be restricted further for sensitive finance (spec §11). Figma: Ready. |
| 35 | Operations | Operate | P1 | `/v/[ventureId]/operate/operations` | 10:3462 | `operations` | `/api/v1/jobs` | Operator+ | Venture RLS + permission | CRUD + validation | Not started | Figma: Ready. |
| 36 | Growth | Operate | P1 | `/v/[ventureId]/operate/growth` | 10:3734 | `growth-operations` | `/api/v1/growth` | Operator+ | Venture RLS + permission | CRUD + attribution | Not started | Figma: Ready. |
| 37 | Technology | Operate | P1 | `/v/[ventureId]/operate/technology` | 10:4344 | `technology-ops` | `/api/v1/integrations/health` | Operator+ | Venture RLS + permission | webhook + idempotency | Not started | Figma permission Admin+. Figma: Ready. |
| 38 | Client CRM | Operate | P1 | `/v/[ventureId]/operate/crm` | 14:4 | `crm` | `/api/v1/clients` | Operator+ | Venture RLS + permission | CRUD + validation | Not started | Figma: Ready. |
| 39 | Scheduling | Operate | P1 | `/v/[ventureId]/operate/schedule` | 14:438 | `scheduling` | `/api/v1/schedule` | Operator+ | Venture RLS + permission | conflict + integration | Not started | Figma route `/operate/scheduling`. Depends on Google Calendar (P1). Figma: Ready. |
| 40 | Quotes & Invoices | Operate | P1 | `/v/[ventureId]/operate/billing` | 14:740 | `invoicing` | `/api/v1/invoices` | Operator+ | Venture RLS + permission; idempotency keys for financial writes | CRUD + webhook | Not started | Figma route `/operate/invoicing`. Figma: Ready. |
| 41 | Forecast vs Actual | Operate | P1 | `/v/[ventureId]/operate/forecast-vs-actual` | 14:1060 | `forecasting` | `/api/v1/forecast-variance` | Viewer+ | Venture RLS + permission | formula unit + integration | Not started | Figma permission Manager+. Deterministic only (spec §13). Figma: Ready. |

## 05 Intelligence

| # | Capability | Product area | Phase | Route | Figma node | Backend module | API / server action | Required permission | RLS / authorization boundary | Test requirement | Current implementation status | Notes / dependencies |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 42 | Copilot | Intelligence | P2 | `/v/[ventureId]/intelligence/copilot` | 14:1766 | `recommendations` | `/api/v1/recommendations` | Viewer+ | Venture RLS + permission | rules unit + evidence | Not started | Figma permission Manager+. Deterministic, rules-based in Release 1; no ML (spec §10, §13.14). Figma: Planned. |

## 06 Portfolio

| # | Capability | Product area | Phase | Route | Figma node | Backend module | API / server action | Required permission | RLS / authorization boundary | Test requirement | Current implementation status | Notes / dependencies |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 43 | Portfolio Command | Portfolio | P3 | `/portfolio/command` | 8:1303 | `portfolio` | `/api/v1/portfolio/command` | Portfolio Viewer+ | Portfolio membership **and** venture RLS on included ventures | grant + aggregation | Not started | Figma permission "Portfolio grant". Figma: Planned. |
| 44 | Venture Pipeline | Portfolio | P3 | `/portfolio/ventures` | 10:3942 | `portfolio` | `/api/v1/portfolio/ventures` | Portfolio Manager+ | Portfolio membership and venture RLS | CRUD + permission | Not started | Figma permission "Portfolio grant". Figma: Planned. |
| 45 | Capital Allocation | Portfolio | P3 | `/portfolio/capital-allocation` | 10:4165 | `portfolio-finance` | `/api/v1/portfolio/capital` | Portfolio Manager+ | Portfolio membership and venture RLS | formula + approval | Not started | Figma route `/portfolio/capital`; Figma permission "Portfolio admin". Figma: Planned. |

## 07 System

| # | Capability | Product area | Phase | Route | Figma node | Backend module | API / server action | Required permission | RLS / authorization boundary | Test requirement | Current implementation status | Notes / dependencies |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 46 | Profile & Security | System | P0 | `/settings/profile-security` | 33:3534 | `identity` | `getProfile`, `updateName`, `changePassword`, `listSessions`, `revokeSession`, `revokeOtherSessions` (module functions) | Authenticated | `users` RLS (self and co-members); sessions reachable only by `dxo_auth` | E2E + auth | In progress | Backend foundation from step 3 is integration-tested; the page and MFA belong to the P0 profile/security/MFA step. Figma route `/settings/profile`. Figma: Ready. |
| 47 | Team & Permissions | System | P0 | `/v/[ventureId]/settings/team` | 33:3712 | `memberships`; RBAC in `ventures/rbac.ts` | `getTeam`; `inviteMemberAction`, `revokeInvitationAction`, `changeRoleAction`, `changeStatusAction`, `approveRequestAction`, `rejectRequestAction` | Admin+ (`team:*` capabilities) | Capability check on every request; actor role re-read in each mutation transaction; RLS on `venture_memberships`, `venture_invitations`, `venture_access_requests`; Owner-invariant trigger; audit | RLS + permission | Foundation | Step 5 (ADR-0013); 100 step-specific tests. Figma API `/api/v1/memberships` not implemented (server actions call the module). Minimal functional UI only. Figma: Ready. |
| 48 | Notifications & Activity | System | P0 | `/settings/notifications-activity` | 33:3910 | `notifications` | `/api/v1/notifications` | Authenticated | `audit_log` RLS (account events: own; venture events: Owner/Admin) | CRUD + delivery | Not started | P0 audit and notification foundation; append-only `audit_log` exists. Figma route `/settings/notifications`; **Figma phase P1 vs spec P0**. Figma: Ready. |
| 49 | Billing & Subscription | System | P0 | `/settings/billing` | 33:4087 | `billing` | `/api/v1/billing` | Owner | Billing accounts separate from venture ownership (ADR-0011) | webhook + idempotency | Not started | P0 billing foundation; Stripe. Figma: Ready. |
| 50 | Help & Support | System | P0 | `/support` | 33:4290 | `support` | `/api/v1/support` | Authenticated | — | CRUD + validation | Not started | Figma route `/settings/help`; **Figma phase P1 vs spec P0**. Figma: Ready. |
| 51 | Integrations | System | P1 | `/v/[ventureId]/settings/integrations` | 14:1443 | `integrations` | `/api/v1/integrations` | Admin+ | Venture RLS; encrypted credentials; signed, deduplicated webhooks | webhook + idempotency | Not started | The Companies House adapter (P0 onboarding) exists behind a stable interface. Figma: Ready. |
| 52 | Request Access | System / Team | P0 | `/v/[ventureId]/request-access` | 54:27340 | `memberships` | `requestAccessAction` → `requestAccess` → `app.request_venture_access()` | Authenticated | Definer function; identical outcome whether or not the venture exists; requesters cannot read requests | RLS + permission | Foundation | ADR-0013 route (canonical). Figma route `/v/[ventureId]/settings/request-access` and API `POST /api/v1/access-requests` superseded (server action only). Figma: New P0. |
| 53 | Access Request Submitted | System / Team | P0 | `/v/[ventureId]/request-access` (submitted state) | 54:27489 | `memberships` | `requestAccessAction` result | Requester | Same as Request Access | E2E + permission | Foundation | Implemented as the submitted state of the request-access route. Figma route `/…/request-access/submitted` and `GET /api/v1/access-requests/[id]` were **not** built: a requester-readable request would reveal whether the venture exists (ADR-0013). See open disagreements. Figma: New P0. |

## 08 States

| # | Capability | Product area | Phase | Route | Figma node | Backend module | API / server action | Required permission | RLS / authorization boundary | Test requirement | Current implementation status | Notes / dependencies |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 54 | 403 | State | P0 | `/errors/403` | 33:4456 | authorization | 403 response contract | Public (spec) | Server-side permission errors; unknown and inaccessible ventures are indistinguishable | RLS + permission | In progress | Inline forbidden notices exist (onboarding, team); the `/errors/403` route belongs to P0 error states. Figma route `/403`; Figma permission Authenticated. Figma: Ready. |
| 55 | 404 | State | P0 | `/errors/404` | 31:3604 | routing | 404 response contract | Public | — | route + recovery | In progress | `notFound()` is used for malformed ids and unknown routes, rendering the default Next.js page; branded page belongs to P0 error states. Figma route `/404`. Figma: Ready. |
| 56 | 500 | State | P0 | `/errors/500` | 31:3692 | observability | 5xx response contract | Public | Errors never expose sensitive data | error + telemetry | Not started | P0 error states. Figma route `/500`. Figma: Ready. |
| 57 | Offline Growth | State | P1 | growth offline state (`/v/[ventureId]/operate/growth`) | 31:3892 | `sync` | `/api/v1/growth/sync` | Viewer+ | Venture RLS | offline + idempotency | Not started | P1 offline is read-only cached state (spec §11). Figma: Ready. |
| 58 | Empty Growth | State | P1 | growth empty state (`/v/[ventureId]/operate/growth`) | 31:3787 | `growth-operations` | `GET /api/v1/growth` | Viewer+ | Venture RLS | empty + accessibility | Not started | Figma: Ready. |
| 59 | Application Loading | State | P0 | app-shell loading state *(Figma `/_states/loading`; not a route)* | 54:27792 | app-shell | pending request contract | Authenticated | — | responsive + accessibility | In progress | Only `/v/[ventureId]/settings/team` has a route-level `loading.tsx`; the P0 application shell and design foundations are outstanding. Figma: New P0. |
| 60 | Generic Empty | State | P0 | app-shell empty state *(Figma `/_states/empty`; not a route)* | 54:27962 | app-shell | empty collection contract | Authenticated | — | responsive + accessibility | In progress | Plain inline empty states exist (team invitations and requests, home ventures); the shared Figma component is outstanding. Figma: New P0. |

## Outside the 60 capabilities

These approved Figma frames and spec items are foundations or specifications, not capability rows:

- **App shell:** responsive behaviour 54:24043; desktop, tablet and mobile 54:24284–54:24286. Spec §12 lists "Global application shell and venture switcher" as P0. The venture-switching service exists (`listSwitchableVentures`, `resolveSelectedVenture`); the shell UI does not.
- **Design system:** Foundations v2 54:15162, Controls v2 54:15538, Product Patterns v2 54:15959, UI foundations 39:457. No `src/ui` implementation yet.
- **Technical specification frames:** spec §9 (`/internal/specs/*`, nodes 19:4–19:2323).

## Open disagreements

The product spec value is in force in each case. Each item needs either a spec update or a Figma update; none was resolved silently.

1. **Accept invitation route:** Figma `/auth/invitations/[token]`; the spec (now) and implementation use `/invite/[token]` (ADR-0013). The Figma matrix needs updating.
2. **Request access routes:** Figma `/v/[ventureId]/settings/request-access` and `/…/submitted`; the spec (now) and implementation use `/v/[ventureId]/request-access`, with "submitted" as an in-page state. The Figma matrix needs updating.
3. **Requester-readable access requests:** Figma `GET /api/v1/access-requests/[id]` (permission Requester) conflicts with ADR-0013's non-disclosure decision. This needs a product decision.
4. **Onboarding routes:** Figma `/onboarding/{business,data-connections,review}` versus spec §5/§8 `/onboarding/[ventureId]/*` (implemented).
5. **Figma-only P0 routes not yet in the spec:** `/auth/mfa`, `/auth/session-expired`, `/auth/reset-password/success`, `/onboarding/creating-workspace`, `/onboarding/complete`. The spec needs to adopt or replace them before their steps.
6. **Session refresh:** Figma `POST /api/v1/auth/refresh` conflicts with ADR-0009 (database sessions, no refresh tokens).
7. **Verify email permission:** Figma Authenticated versus spec Public with valid token (implemented per spec).
8. **System routes and phases:** Profile `/settings/profile` vs `/settings/profile-security`; Notifications `/settings/notifications` (P1) vs `/settings/notifications-activity` (P0); Help `/settings/help` (P1) vs `/support` (P0).
9. **State routes:** Figma `/403`, `/404`, `/500` vs spec `/errors/*`. Figma 403 permission Authenticated vs spec Public.
10. **Build routes:** Figma `research`, `blueprint`, `launch`, `funding`, `marketing-plan`, `sales-plan`, `operations-plan` vs spec `market-research`, `reverse-blueprint`, `launch-control`, `funding-waterfall`, `marketing`, `sales`, `operations-team`.
11. **Operate and Portfolio routes:** Figma `/operate/scheduling`, `/operate/invoicing`, `/portfolio/capital` vs spec `/operate/schedule`, `/operate/billing`, `/portfolio/capital-allocation`.
12. **Minimum permissions (Figma vs spec):**
    - £1M Growth Command: Manager+ vs Viewer+.
    - Idea Lab, Market Research, Launch Control, Risk Register, Assets: Manager+ vs Operator+.
    - Funding Waterfall: Admin+ vs Manager+.
    - Compliance, Systems: Admin+ vs Manager+.
    - Technology: Admin+ vs Operator+.
    - Forecast vs Actual: Manager+ vs Viewer+.
    - Copilot: Manager+ vs Viewer+.
    - Portfolio rows: "Portfolio grant / Portfolio admin" vs "Portfolio Viewer+ / Manager+".
13. **API surface:** the Figma API column names REST endpoints (`/api/v1/memberships`, `/api/v1/invitations/accept`, `/api/v1/access-requests`, `/api/v1/onboarding/*`) that P0 steps 4–5 implemented as server actions over the same module services (ADR-0006). REST and OpenAPI for these groups are outstanding (spec §14).
