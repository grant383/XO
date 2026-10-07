# DirectorXO Implementation Matrix

Route-to-delivery tracker for the 60 approved DirectorXO capabilities. Rows mirror the Figma **Master Implementation Matrix** (file `rqWc0iFUFSTdudXuO4Gm47`, node `54:29298`, "Spec v1.0 · Oct 2026 · 8 domains · 60 rows"). Status reflects the repository on branch `p0/foundation` after P0 step 6 (MFA, recovery, session/device management, ADR-0016), the application shell and journey E2E (ADR-0015), the UI foundations (ADR-0014) and the first P1 slice, Command Centre (ADR-0024).

## How to read this matrix

Precedence (CLAUDE.md): 1. `DIRECTORXO_PRODUCT_SPEC.md`, 2. this matrix, 3. approved Figma, 4. ADRs, 5. existing implementation. The Figma Master Implementation Matrix defines the capability scope. Where its labels differ from the spec:

- the **Route** and **Required permission** columns show the spec's canonical value;
- the Figma value is recorded in **Notes**;
- every difference is listed under [Known design-sync items](#known-design-sync-items).

Design-sync items are corrections owed to Figma. They are **not implementation blockers**. Implementation follows the spec.

"Step N" refers to the current P0 execution numbering (CLAUDE.md). Step 6 = MFA, recovery, session/device management.

### Status values

| Status | Meaning |
|---|---|
| **Implemented** | Meets the spec §22 definition of done, including the approved Figma visual, responsive states and Playwright E2E. |
| **Foundation** | Server logic, server-side authorisation, RLS (where data is venture-owned), audit and automated unit/integration tests are in place. UI is the **minimal functional P0 presentation only**. The Figma visual and E2E are outstanding. |
| **In progress** | Part of the capability exists (for example backend only, or an inline state instead of the specified route). The core deliverable is incomplete. |
| **Not started** | No implementation beyond shared foundations. |
| **Deferred** | Deliberately moved out of its listed phase by a recorded decision. |

Twenty-four capabilities are **Implemented**: they have the approved Figma visual, desktop and mobile layouts, and Playwright E2E with axe accessibility checks (ADR-0014, ADR-0015, ADR-0016). The remaining P0 rows are Billing & Subscription (49) and the non-UI parts of rows 12, 14, 56 and 59.

### Permission order (spec §7)

Public → Authenticated → Viewer+ → Operator+ → Manager+ → Admin+ → Owner. Canonical venture roles: **Owner, Admin, Manager, Operator, Viewer** (no other venture roles exist). Portfolio permissions additionally require explicit portfolio membership.

## Summary

| Domain | Rows | Implemented | Foundation | In progress | Not started | Deferred |
|---|---|---|---|---|---|---|
| 01 Auth & Onboarding | 15 | 13 | 0 | 2 | 0 | 0 |
| 02 Command | 3 | 2 | 0 | 0 | 1 | 0 |
| 03 Build | 15 | 0 | 0 | 0 | 15 | 0 |
| 04 Operate | 8 | 0 | 0 | 0 | 8 | 0 |
| 05 Intelligence | 1 | 0 | 0 | 0 | 1 | 0 |
| 06 Portfolio | 3 | 0 | 0 | 0 | 3 | 0 |
| 07 System | 8 | 6 | 1 | 0 | 1 | 0 |
| 08 States | 7 | 3 | 0 | 2 | 2 | 0 |
| **Total** | **60** | **24** | **1** | **4** | **31** | **0** |

## 01 Auth & Onboarding

| # | Capability | Product area | Phase | Route | Figma node | Backend module | API / server action | Required permission | RLS / authorization boundary | Test requirement | Current implementation status | Notes / dependencies |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Login | Auth | P0 | `/auth/login` | 31:3441 | `identity` | `loginAction` → `identity.login` → Better Auth `POST /api/v1/auth/sign-in/email` | Public | Better Auth as `dxo_auth`; per-IP and per-account rate limits; account lockout; Origin/CSRF checks forced on (ADR-0009) | E2E + auth | Implemented | Integration-tested. Figma visual and Playwright E2E + axe (desktop, mobile) in `tests/e2e/auth.spec.ts` (ADR-0014). Honours a validated `next` path (ADR-0013). SSO and "Remember me" are not built (design-sync 14). Figma API label `POST /api/v1/auth/login` differs from the implemented Better Auth path. Figma: Ready. |
| 2 | Login error | Auth | P0 | `/auth/login/error` | 31:3549 | `identity` | as Login | Public | Identical response for unknown account and wrong password; lockout | E2E + lockout | Implemented | The Figma failed-sign-in state renders inline on `/auth/login` with a focused error summary (E2E-tested); the canonical `/auth/login/error` route now reuses the same form with a non-enumerating initial error. Desktop/mobile retry and axe coverage: `tests/e2e/login-error.spec.ts`. Lockout is implemented and tested. Remaining attempts are not shown (design-sync 18). Figma: Ready. |
| 3 | Forgot password | Auth | P0 | `/auth/forgot-password` | 31:3503 | `identity` | `forgotPasswordAction` → `requestPasswordReset` → `POST /api/v1/auth/request-password-reset` | Public | Non-enumerating response; IP and account rate limits | E2E + rate limit | Implemented | Figma visual and Playwright E2E + axe (desktop, mobile) in `tests/e2e/auth.spec.ts` (ADR-0014). Figma API label `POST /api/v1/auth/password/forgot`. Figma: Ready. |
| 4 | Set new password | Auth | P0 | `/auth/reset-password` | 33:3315 | `identity` | `resetPasswordAction` → `resetPassword` → `POST /api/v1/auth/reset-password` | Public with valid token | Hashed, single-use, 30-minute token; reset revokes all sessions | token + validation | Implemented | Token consumed only on explicit POST. Figma visual and Playwright E2E + axe (desktop, mobile) in `tests/e2e/auth.spec.ts` (ADR-0014). Confirm-password check in `resetPasswordAction`; requirements panel states the enforced policy (design-sync 15). Figma: Ready. |
| 5 | Create account | Auth | P0 | `/auth/register` | 33:3202 | `identity` | `registerAction` → `register` → `POST /api/v1/auth/sign-up/email` | Public | Duplicate email returns a synthetic success (no enumeration); rate limits | E2E + validation | Implemented | Figma visual and Playwright E2E + axe (desktop, mobile) in `tests/e2e/auth.spec.ts` (ADR-0014). Success shows the Figma "Check your inbox" state (33:3266) with resend (`resendVerificationAction`). Carries a validated `next` (e.g. `/invite/[token]`) through the verification email. Figma API label `POST /api/v1/users`. Figma: Ready. |
| 6 | Verify email | Auth | P0 | `/auth/verify-email` | 33:3266 | `identity` | `verifyEmailAction` → `verifyEmail` → Better Auth `/api/v1/auth/verify-email` | Public with valid token | Single-use JWT recorded in `auth_consumed_tokens` | token + idempotency | Implemented | Figma visual and Playwright E2E + axe (desktop, mobile) in `tests/e2e/auth.spec.ts` (ADR-0014). Figma lists the permission as Authenticated; spec §8 says Public with valid token, and the implementation follows the spec. Figma: Ready. |
| 7 | Accept invitation | Auth / Team | P0 | `/invite/[token]` | 54:27078 | `memberships` | `previewInvitation`; `acceptInvitationAction` → `acceptInvitation` → `app.accept_venture_invitation()` | Invited user: signed in, email verified, email equals invited address | SECURITY DEFINER function; token stored as SHA-256 digest only; atomic membership creation with audit; RLS on `venture_invitations` | E2E + auth | Implemented | ADR-0013 route (canonical). Figma route `/auth/invitations/[token]` and API `POST /api/v1/invitations/accept` are superseded (server action only). Figma: New P0. Figma visual and Playwright E2E + axe (desktop, mobile) in `tests/e2e/team.spec.ts` (ADR-0015). |
| 8 | MFA | Auth | P0 | `/auth/mfa` | 54:27145 | `identity` (Figma: `auth-security`) | `login` → `mfaRequired`; `verifyMfaAction` → `verifyMfaChallenge` → Better Auth `POST /api/v1/auth/two-factor/verify-totp` / `verify-backup-code`; enrolment via `startMfaEnrolment`, `confirmMfaEnrolment` (Profile & Security) | Authenticated (first factor verified; second factor pending or being enrolled) | Signed challenge cookie only (no session before the second factor); `two_factors` reachable only by `dxo_auth`; per-challenge and per-account lockout; per-IP rate limits; audit `auth.mfa.*` | E2E + recovery | Implemented | ADR-0016. TOTP (RFC 6238) with ten single-use, encrypted backup codes in `two_factors` (dxo_auth only, FORCE RLS). 10-minute signed challenge; 5 attempts per challenge; 10 consecutive failures lock the factor for 15 minutes; codes accepted once (replay protection). Integration tests `tests/integration/auth/mfa.int.test.ts`; E2E + axe `tests/e2e/security.spec.ts` and `tests/e2e/profile.spec.ts`. "Trust this device" and "Can’t access your authenticator?" not built (design-sync 19, 24). Figma: New P0. |
| 9 | Session expired | Auth | P0 | `/auth/session-expired` | 54:27222 | `identity` (sessions) | None: database-backed sessions, no refresh-token API (ADR-0009) | Public | Idle (7 d) and absolute (30 d) expiry enforced server-side on every request | E2E + redirect | Implemented | ADR-0016. Requests with a session cookie for an ended session (7-day idle, 30-day absolute, or revoked) land here and keep a validated `next`; visitors without a cookie go to `/auth/login`. No refresh-token API (ADR-0009). E2E + axe in `tests/e2e/security.spec.ts`. Copy states the real policy (design-sync 23). Figma: New P0. |
| 10 | Password reset success | Auth | P0 | `/auth/reset-password/success` | 54:27280 | `identity` | Result of `resetPasswordAction` (Figma label `GET /api/v1/auth/reset-status`) | Public | Reveals nothing about the token or account | E2E + auth | Implemented | ADR-0016. `resetPasswordAction` redirects here; static and public, reveals nothing about the token or account. E2E + axe in `tests/e2e/security.spec.ts` (reset → success → sign in with the new password). Support links not built (design-sync 23). Figma: New P0. |
| 11 | Business setup | Onboarding | P0 | `/onboarding/[ventureId]/business` | 33:3378 | `ventures` | `saveBusinessAction` → `saveBusinessDetails`; `lookupCompanyAction` | Owner (`venture:onboard`) of a draft venture | `resolveVenture` with capability; RLS `venture_onboarding` owner-only update; audit | CRUD + validation | Implemented | Figma route `/onboarding/business` and permission Authenticated superseded by spec §5/§8 (venture-scoped, Owner). Figma API `PUT /api/v1/onboarding/business` not implemented. Figma: Ready. Figma visual and E2E in `tests/e2e/onboarding.spec.ts` (ADR-0015). |
| 12 | Data connections | Onboarding | P0 | `/onboarding/[ventureId]/data-connections` | 33:3447 | `ventures`; Companies House adapter | `completeDataConnectionsAction` → `completeDataConnections` | Owner | As Business setup | OAuth + idempotency | In progress | Connection-status review step is implemented. Provider OAuth connect (Figma `POST /api/v1/integrations/connect`) depends on P1 integrations. Figma module `integrations`; Figma route `/onboarding/data-connections`. Figma: Ready. |
| 13 | Review onboarding | Onboarding | P0 | `/onboarding/[ventureId]/review` | 39:164 | `ventures` | `completeOnboardingAction` → `completeOnboarding` → `app.complete_venture_onboarding()` | Owner | Definer function revalidates Owner, steps and settings; draft → active only here; audit | E2E + validation | Implemented | Figma route `/onboarding/review`. Figma: Ready. Figma visual and E2E in `tests/e2e/onboarding.spec.ts` (ADR-0015). |
| 14 | Creating workspace | Onboarding | P0 | UX state of onboarding (no route; Figma `/onboarding/creating-workspace`) | 54:27638 | `ventures` (Figma: `workspace-bootstrap`) | `createVentureAction` → `createDraftVenture` → `app.create_venture()` (Figma label `POST /api/v1/ventures/bootstrap`) | Authenticated | UX state only, not security state: venture status and onboarding progress stay server-authoritative (spec §5) | job + idempotency | In progress | Creation is synchronous and idempotent (request id) at `/onboarding`; the progress state is not built. A bootstrap job would need the BullMQ worker. Figma: New P0. Figma presentation exists (ADR-0015); the bootstrap job state is outstanding. |
| 15 | Onboarding complete | Onboarding | P0 | UX state of onboarding (no route; Figma `/onboarding/complete`) | 54:27717 | `ventures` (Figma: `workspace-bootstrap`) | Result of `completeOnboardingAction` → `app.complete_venture_onboarding()` | Owner | UX state only, not security state: activation happens only in the definer function (spec §5) | E2E + readiness | Implemented | Completion currently redirects to `/?onboarded=1`; the completion state is not built. Figma: New P0. Completion state built and E2E-tested (ADR-0015). |

## 02 Command

| # | Capability | Product area | Phase | Route | Figma node | Backend module | API / server action | Required permission | RLS / authorization boundary | Test requirement | Current implementation status | Notes / dependencies |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 16 | Command Centre | Command | P1 | `/v/[ventureId]/command` | 8:651 | `command` | `GET /api/v1/command?ventureId=` → `getCommandCentre`; `createTaskAction` → `createTask`, `setTaskStatusAction` → `setTaskStatus` | Viewer+ (`command:view`); tasks Operator+ (`command:manage_tasks`) | `resolveSelectedVenture` with capability on every request/action; `command_tasks` FORCE RLS: members read the venture in context, Operator+ insert/update as themselves, status-only updates, no deletes (migration 0014); atomic `command.task.*` audit | RLS + permission | Implemented | ADR-0024. Four Figma quadrants on the approved shell (2×2 from 1024px, stacked below). Tasks are persisted, retry-safe and audited, with venture-timezone due labels. "Why" shows deterministic versioned rules with evidence and threshold (`command.tasks.overdue@1`, `command.tasks.high_priority_due_today@1`, `command.metrics.awaiting_sources@1`); not persisted (the recommendation workflow is P2). The six metrics report `awaiting_source` with their source module until Operate Finance/Operations/Growth ship (no sample figures). "What changed" is derived from task history (venture audit is Owner/Admin-only). Loading, error, empty, Viewer read-only, non-member and offline read-only states. Tests: `tests/unit/command.test.ts` (golden rules, calendar, formatting, validation), `tests/integration/command.int.test.ts`, `tests/rls/command.rls.test.ts`, `tests/e2e/command.spec.ts` (desktop + mobile, axe). `/v/[ventureId]` redirects here. Design-sync 26–29. Figma: Ready. |
| 17 | £1M Growth Command | Command | P1 | `/v/[ventureId]/command/growth-1m` | 29:1087 | `growth-command` | `GET /api/v1/growth-command` | Viewer+ | Venture RLS | formula unit + integration | Not started | Figma permission Manager+ disagrees with spec Viewer+. Deterministic formulas per spec §13.11. Figma: Ready. |
| 18 | Legacy dashboard | Command | P1 | `/dashboard` → `/v/[ventureId]/command` | 3:255 | routing | Redirect only (307; see notes) | Viewer+ | Redirect resolves the first accessible active venture from the session; signed out → sign-in with `next=/dashboard`; no venture → onboarding | redirect + deep link | Implemented | ADR-0024. Owns no data. A temporary redirect, because the target depends on the signed-in account and a cached 301/308 would send another account to the wrong venture (design-sync 29). E2E in `tests/e2e/command.spec.ts`. Figma: Legacy/Deprecated. |

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
| 35 | Operations | Operate | P1 | `/v/[ventureId]/operate/operations` | 10:3462 | `operations` | No new API (local reference slice) | Operator+ (`operations:view`) | Server actor + active venture membership under existing RLS; canonical RBAC before samples render | Focused render + permission + accessibility | Local implementation; verification blocked | Exact Figma context and screenshot pulled. Approved shared shell; fixed labelled job/team/revenue/capacity fixtures. No live GS Appliance data, persistence or dispatch mutations. Unit 2/2 and focused lint pass; browser setup failed waiting for verification email before reaching Operations. Captures and browser verification remain incomplete. Stopped without harness debugging per user instruction. See `docs/verification/operations.md`. Full live operational CRUD remains pending. |
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
| 46 | Profile & Security | System | P0 | `/settings/profile-security` | 33:3534 | `identity` | `updateNameAction`, `changePasswordAction`, `startMfaAction`, `confirmMfaAction`, `disableMfaAction`, `regenerateCodesAction`, `revokeSessionAction`, `revokeOtherSessionsAction` → identity flows (`getProfile`, `getMfaStatus`, `listSessions`, `getPasswordChangedAt`, …) | Authenticated | `users` RLS (self and co-members); sessions reachable only by `dxo_auth` | E2E + auth | Implemented | ADR-0016. Account-level page in the account settings shell (no venture context): personal details (name editable, email read-only), password change, MFA set-up with QR code and manual key, backup-code regeneration, MFA off (password + 15-minute freshness), device list with per-device and all-other sign-out, sign out. Linked from the account menu and the venture shell System section. E2E + axe `tests/e2e/profile.spec.ts`. Job title, phone, passkeys and the settings sub-navigation are not built (design-sync 20–22). Figma route `/settings/profile`. Figma: Ready. |
| 47 | Team & Permissions | System | P0 | `/v/[ventureId]/settings/team` | 33:3712 | `memberships`; RBAC in `ventures/rbac.ts` | `getTeam`; `inviteMemberAction`, `revokeInvitationAction`, `changeRoleAction`, `changeStatusAction`, `approveRequestAction`, `rejectRequestAction` | Admin+ (`team:*` capabilities) | Capability check on every request; actor role re-read in each mutation transaction; RLS on `venture_memberships`, `venture_invitations`, `venture_access_requests`; Owner-invariant trigger; audit | RLS + permission | Implemented | Step 5 (ADR-0013); 100 step-specific tests. Figma API `/api/v1/memberships` not implemented (server actions call the module). Minimal functional UI only. Figma: Ready. Figma visual and E2E in `tests/e2e/team.spec.ts` (ADR-0015). |
| 48 | Notifications & Activity | System | P0 | `/settings/notifications-activity` | 33:3910 | `notifications` | `/api/v1/notifications` | Authenticated | `audit_log` RLS (account events: own; venture events: Owner/Admin) | CRUD + delivery | Implemented | Persistent account inbox projected from new audit events without metadata, cutoff-safe read state, filters/pagination, REST/OpenAPI, FORCE RLS and independently authorised Owner/Admin venture activity (ADR-0018). Two unit and ten database/catalog checks, desktop/mobile E2E and axe pass. Email digest is not enabled; existing transactional delivery remains separate. Figma route `/settings/notifications`; **Figma phase P1 vs spec P0**. Figma: Ready. |
| 49 | Billing & Subscription | System | P0 | `/settings/billing` | 33:4087 | `billing` | `/api/v1/billing` | Owner | Billing accounts separate from venture ownership (ADR-0011) | webhook + idempotency | Foundation | Separate billing ownership, subscription mirror and explicit entitlements, FORCE RLS, configured-price SDK adapter, retry-safe checkout, signed/deduplicated webhooks and hosted billing management (ADR-0019). Eight adapter/boundary unit checks and seven billing integration tests pass; full 265-test database gate, production build, desktop E2E and axe pass. Mobile regression is pending. Checkout remains unavailable without an approved real recurring price. Full inline payment/invoice/usage presentation and real-provider/release verification remain outstanding; Figma map stays VERIFY. |
| 50 | Help & Support | System | P0 | `/support` | 33:4290 | `support` | `/api/v1/support` | Authenticated | — | CRUD + validation | Implemented | Account-owned support requests with retry-safe creation, atomic audit, FORCE RLS, search, details, cursor pagination, offline/pending/error states and exact Figma SVGs (ADR-0017). REST/OpenAPI and desktop/mobile E2E + axe pass. No external delivery or SLA is claimed. Figma route `/settings/help`; **Figma phase P1 vs spec P0**. Figma: Ready. |
| 51 | Integrations | System | P1 | `/v/[ventureId]/settings/integrations` | 14:1443 | `integrations` | `/api/v1/integrations` | Admin+ | Venture RLS; encrypted credentials; signed, deduplicated webhooks | webhook + idempotency | Not started | The Companies House adapter (P0 onboarding) exists behind a stable interface. Figma: Ready. |
| 52 | Request Access | System / Team | P0 | `/v/[ventureId]/request-access` | 54:27340 | `memberships` | `requestAccessAction` → `requestAccess` → `app.request_venture_access()` | Authenticated | Definer function; identical outcome whether or not the venture exists; requesters cannot read requests | RLS + permission | Implemented | ADR-0013 route (canonical). Figma route `/v/[ventureId]/settings/request-access` and API `POST /api/v1/access-requests` superseded (server action only). Figma: New P0. Figma visual and E2E in `tests/e2e/access.spec.ts` (ADR-0015). |
| 53 | Access Request Submitted | System / Team | P0 | `/v/[ventureId]/request-access` (submitted state) | 54:27489 | `memberships` | `requestAccessAction` result; no requester read API in P0 (spec §11) | Requester | Same as Request Access | E2E + permission | Implemented | Implemented as the submitted state of the request-access route. `GET /api/v1/access-requests/[id]` and `/…/submitted` are not part of P0: a requester-readable request would reveal whether the venture exists (ADR-0013). Figma: New P0. E2E in `tests/e2e/access.spec.ts` (ADR-0015). |

## 08 States

| # | Capability | Product area | Phase | Route | Figma node | Backend module | API / server action | Required permission | RLS / authorization boundary | Test requirement | Current implementation status | Notes / dependencies |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 54 | 403 | State | P0 | `/errors/403` | 33:4456 | authorization | 403 response contract | Public (spec) | Server-side permission errors; unknown and inaccessible ventures are indistinguishable | RLS + permission | Implemented | Inline forbidden notices exist (onboarding, team); the `/errors/403` route belongs to P0 error states. Figma route `/403`; Figma permission Authenticated. Figma: Ready. `/errors/403` and in-place 403 states built and E2E-tested (ADR-0015). |
| 55 | 404 | State | P0 | `/errors/404` | 31:3604 | routing | 404 response contract | Public | — | route + recovery | Implemented | `notFound()` is used for malformed ids and unknown routes, rendering the default Next.js page; branded page belongs to P0 error states. Figma route `/404`. Figma: Ready. `/errors/404` returns a real 404 and is E2E-tested (ADR-0015). |
| 56 | 500 | State | P0 | `/errors/500` | 31:3692 | observability | 5xx response contract | Public | Errors never expose sensitive data | error + telemetry | In progress | P0 error states. Figma route `/500`. Figma: Ready. `/errors/500` and error boundaries built and E2E-tested (ADR-0015); Privacy-safe Next.js `onRequestError` telemetry is wired to Pino and unit-tested (three checks). Production alert/dashboard delivery and release monitoring remain unverified. |
| 57 | Offline Growth | State | P1 | growth offline state (`/v/[ventureId]/operate/growth`) | 31:3892 | `sync` | `/api/v1/growth/sync` | Viewer+ | Venture RLS | offline + idempotency | Not started | P1 offline is read-only cached state (spec §11). Figma: Ready. |
| 58 | Empty Growth | State | P1 | growth empty state (`/v/[ventureId]/operate/growth`) | 31:3787 | `growth-operations` | `GET /api/v1/growth` | Viewer+ | Venture RLS | empty + accessibility | Not started | Figma: Ready. |
| 59 | Application Loading | State | P0 | app-shell loading state *(Figma `/_states/loading`; not a route)* | 54:27792 | app-shell | pending request contract | Authenticated | — | responsive + accessibility | Implemented | Every P0 page resolves to an explicit `loading.tsx` using the shared Figma `LoadingState`: venture shell (incl. team), onboarding, invitation, request access, Profile & Security, Notifications, Support and Billing. The entry redirect, auth and static error pages deliberately have no streaming boundary: they redirect at once or render without data work, and a fallback would turn their server redirects into client-side ones. `tests/unit/loading-coverage.test.tsx` lists every page with its decided boundary and fails when a page is added without one; it also checks the polite status announcement. Figma: New P0. |
| 60 | Generic Empty | State | P0 | app-shell empty state *(Figma `/_states/empty`; not a route)* | 54:27962 | app-shell | empty collection contract | Authenticated | — | responsive + accessibility | Implemented | Plain inline empty states exist (team invitations and requests, home ventures); the shared Figma component is outstanding. Figma: New P0. Shared empty-state component in `src/ui` (ADR-0015). |

## Outside the 60 capabilities

These approved Figma frames and spec items are foundations or specifications, not capability rows:

- **App shell:** responsive behaviour 54:24043; desktop, tablet and mobile 54:24284–54:24286. Spec §12 lists "Global application shell and venture switcher" as P0. Built (ADR-0015); account-level pages (`/settings/*`) use the same shell with no venture in context (ADR-0016).
- **Design system:** Foundations v2 54:15162, Controls v2 54:15538, Product Patterns v2 54:15959, UI foundations 39:457. Implemented in `src/ui` (tokens, Geist fonts, Button, Text Field, Checkbox, Alert, Status badge, error summary, Figma icon assets) per ADR-0014. Product Patterns v2 components arrive with the screens that use them.
- **Technical specification frames:** spec §9 (`/internal/specs/*`, nodes 19:4–19:2323).

## Resolved decisions

These were open between the spec, ADRs and Figma; they are now decided (spec §5, §8, §11; CLAUDE.md):

- **Step 6** = MFA, recovery, session/device management.
- **Canonical routes:** `/invite/[token]`, `/v/[ventureId]/request-access`, `/onboarding/[ventureId]/business`, `/onboarding/[ventureId]/data-connections`, `/onboarding/[ventureId]/review`, `/auth/mfa`, `/auth/session-expired`, `/auth/reset-password/success`.
- **Onboarding "creating workspace" and "complete"** are UX states only, not routes or security state.
- **Canonical roles:** Owner, Admin, Manager, Operator, Viewer.
- **Sessions** stay database-backed. No refresh-token API.
- **No `GET /api/v1/access-requests/[id]`** in P0.
- **Phases and permissions:** Notifications and Activity is P0; Help and Support is P0; £1M Growth Command is Viewer+; Copilot is Viewer+.

## Known design-sync items

Figma labels that differed from the canonical values above. None blocks implementation.

**Status (Oct 2026):** items 1–12 have been applied in the Figma file. Routes, permissions, phases and role labels were corrected in the Master Implementation Matrix (54:29298), the domain matrices (50:9967, 50:10242, 50:10477), the API (19:1684) and security (19:2078) frames, and the Team and Permissions, Accept invitation, Request access, Access request submitted and 403 screens. Canonical routes are recorded as Dev Mode annotations on the affected frames. Variables (127), native components (51) and the 60 capability rows are unchanged. The list below is kept as a record.

**Open (copy and controls that differ from the backend, ADR-0014):**
14. **SSO, "Remember me" and Terms checkbox** (31:3441, 33:3202): not in the spec or backend; not built.
15. **Password requirements** (33:3202, 33:3315): Figma "10+ characters, upper/lower, number and symbol" → enforced policy 12–128 characters (ADR-0009).
16. **Verification link lifetime** (33:3266): Figma "30 minutes" → 24 hours (`TOKEN_POLICY`).
17. **Auth trust metrics** (auth story panel): Figma sample data ("£1M growth", "Balanced") and "Encryption: End-to-end" → TLS in transit, secure auth and role-based access. The app does not provide end-to-end encryption.
18. **Failed sign-in** (31:3549): "You have 4 attempts remaining" → non-enumerating message; remaining attempts are not disclosed.
19. **Trust this device** (54:27145): not built. Trusted devices could not be listed or revoked in device management (ADR-0016).
20. **Passkeys** (33:3534): not in P0 scope; the row is not built.
21. **Job title and phone** (33:3534): not in the data model; only full name (editable) and work email (read-only) are shown.
22. **Settings sub-navigation** (33:3534): Team & Permissions, Notifications, Billing & Subscription and Data & Backup links are not shown until those account-level pages exist (no placeholder navigation). Team & Permissions is venture-scoped and stays in the venture shell.
23. **Session expired and reset success copy** (54:27222, 54:27280): "30 minutes of inactivity" → the real policy (7 days idle, 30 days absolute); "draft content encrypted in this browser" removed (no such feature); "Contact security support" and "Report an unrecognised reset" not built until `/support` exists.
24. **MFA challenge** (54:27145): masked account email and "Can’t access your authenticator?" not built; backup codes are the recovery path (ADR-0016).
25. **Session location** (33:3534): "London, United Kingdom" → the IP address recorded at sign-in; no geo-IP lookup.
26. **Command "Why" cards** (8:651): "AI Analysis · 2h ago" → "Rule `<id>` v`<n>` · Evaluated HH:MM", with a severity label and expandable evidence and threshold. Release 1 has no AI analysis (spec §3, §13.14).
27. **Command "Live" indicator** (8:651): → "Updated HH:MM" freshness, or "Offline · showing data from HH:MM". The page is a server snapshot, not a live stream.
28. **Command metric tiles** (8:651): sample figures (£38,420, 187, …) → "—" plus the named source until Operate modules supply records. "Customer sat" has no data source in spec §16 and needs a product decision.
29. **Legacy dashboard redirect** (50:10242 D1 "permanent redirect"): implemented as 307 because the target is per account. Command Centre uses the approved app shell (54:24284–54:24286), not the frame's embedded pre-shell sidebar.

**Open (needs design work, not label changes):**
- **Request access / Access request submitted (54:27340, 54:27489):** the screens still depict an existing member requesting a higher permission, with justification, a named approver, a request reference and approval tracking. P0 (ADR-0013) is a signed-in non-member requesting venture access with no venture disclosure; the reviewer chooses the role. Role labels were canonicalised and the conflict is annotated on both frames.
- Item 13 (API labels) is implementation work, not a Figma item.

1. **Accept invitation route:** Figma `/auth/invitations/[token]` → canonical `/invite/[token]`.
2. **Request access routes:** Figma `/v/[ventureId]/settings/request-access` and `/…/submitted` → canonical `/v/[ventureId]/request-access` (submitted is a state).
3. **Requester read API:** Figma `GET /api/v1/access-requests/[id]` (Requester) → not in P0.
4. **Onboarding routes:** Figma `/onboarding/{business,data-connections,review}` → canonical `/onboarding/[ventureId]/*`.
5. **Onboarding UX states:** Figma `/onboarding/creating-workspace` and `/onboarding/complete` routes → UX states, no routes.
6. **Session refresh:** Figma `POST /api/v1/auth/refresh` → none (database sessions).
7. **Verify email permission:** Figma Authenticated → Public with valid token.
8. **System routes and phases:** Figma `/settings/profile`, `/settings/notifications` (P1), `/settings/help` (P1) → `/settings/profile-security`, `/settings/notifications-activity` (P0), `/support` (P0).
9. **State routes:** Figma `/403`, `/404`, `/500` (403 Authenticated) → `/errors/403`, `/errors/404`, `/errors/500` (Public).
10. **Build routes:** Figma `research`, `blueprint`, `launch`, `funding`, `marketing-plan`, `sales-plan`, `operations-plan` → `market-research`, `reverse-blueprint`, `launch-control`, `funding-waterfall`, `marketing`, `sales`, `operations-team`.
11. **Operate and Portfolio routes:** Figma `/operate/scheduling`, `/operate/invoicing`, `/portfolio/capital` → `/operate/schedule`, `/operate/billing`, `/portfolio/capital-allocation`.
12. **Minimum permissions (Figma → spec):**
    - £1M Growth Command: Manager+ → Viewer+.
    - Idea Lab, Market Research, Launch Control, Risk Register, Assets: Manager+ → Operator+.
    - Funding Waterfall: Admin+ → Manager+.
    - Compliance, Systems: Admin+ → Manager+.
    - Technology: Admin+ → Operator+.
    - Forecast vs Actual: Manager+ → Viewer+.
    - Copilot: Manager+ → Viewer+.
    - Portfolio: "Portfolio grant / Portfolio admin" → Portfolio Viewer+ / Portfolio Manager+.
13. **API labels:** Figma names REST endpoints (`/api/v1/memberships`, `/api/v1/invitations/accept`, `/api/v1/access-requests`, `/api/v1/onboarding/*`, `/api/v1/auth/login`) where P0 uses server actions and Better Auth paths over the same module services (ADR-0006, ADR-0009). Spec §14 REST/OpenAPI coverage for these groups remains outstanding implementation work, not a Figma item.
