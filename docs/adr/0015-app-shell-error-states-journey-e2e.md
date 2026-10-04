# ADR-0015 — Application shell, error states and journey E2E

- Status: Accepted (P0 shell, venture switcher and error states)
- Date: 2026-10-04

## Context
Spec §12 lists the global application shell and venture switcher, the request-access flow and invitation acceptance as P0, and §5 fixes `/errors/*` as the error routes. The approved Figma frames are the app shell (54:24284–54:24286, behaviour 54:24043), Team and Permissions (33:3712), the onboarding, invitation and request-access screens, and the 403/404/500 states (33:4456, 31:3604, 31:3692). The backend for all of these already exists (ADR-0013, step 4); this change is presentation, routing structure and tests.

## Decision

### Shell and venture context
- Venture pages live in a `(shell)` route group under `/v/[ventureId]`. URLs do not change. `/v/[ventureId]/request-access` stays outside the group because the requester is not a member and must see no venture context.
- The shell layout resolves the venture with `resolveSelectedVenture` on every request. Unknown and inaccessible ventures render the same 403 view; drafts redirect to onboarding. The layout is not the authorisation boundary: each page still authorises its own data (`getTeam`, `resolveSelectedVenture`), and RLS confirms it.
- The venture switcher lists `listSwitchableVentures` (active memberships only) and navigates to `/v/[id]`. No venture is chosen or stored on the client.
- Navigation lists only routes that exist and the role can open: Home, and Team & permissions for Admin+. Command, Build, Operate, Intelligence and Portfolio are added, in the spec §4 order, when their routes ship. Showing inert links would invite 404s and suggest unbuilt features. Hiding an item is presentation only.
- Breakpoints follow 54:24043: 248px sidebar from 1024px, 76px rail from 768px, a modal `<dialog>` menu sheet below 768px; a sticky 56px top bar; content capped at 1120px.
- `/` routes signed-in users to their first active venture, or to onboarding.

### Error states
- `/errors/403`, `/errors/404` and `/errors/500` are public and show no session or venture context. `/errors/404` calls `notFound()` so it returns a real 404 status. Root `not-found`, `error` and `global-error` boundaries, and an in-shell `error` boundary, render the same Figma states.
- Only the opaque error digest reaches the browser; messages and stacks never do (spec §22).
- `forbidden()` is not used. In Next.js 16.3 it still requires the experimental `authInterrupts` flag. Forbidden states render the 403 component in place (HTTP 200), which matches the existing inline behaviour. Revisit when the API is stable.

### Data shown on screens
Screens show only what the backend provides. Figma controls with no backend (decline invitation, resend invitation, provider connect buttons, justification, cancel request, system status, support) and sample data (revenue, forecasts, seats, last active, approvers) are not built. Each difference is a design-sync item in the implementation matrix.

### Journey E2E
- Journeys create users through the public API: sign-up, the verification email read from Mailpit, sign-in. Nothing is seeded and there are no test-only backdoors.
- Auth rate limits are per client IP (ADR-0009). The dev server keeps a client-supplied `X-Forwarded-For`, so each spec file sends its own TEST-NET-2 address and never shares a limiter bucket with another file. Production trusts only the rightmost proxy-appended address, so this does not weaken the limiter.
- Playwright runs one worker. Every journey shares one dev server, and several browsers compiling routes at once exhausted memory on a 3 GB machine.

## Consequences
- Matrix rows 7, 11, 13, 15, 47, 52, 53, 54, 55 and 60 meet the definition of done. Rows 12, 14, 56 and 59 have their Figma presentation, but each still lacks a non-UI requirement.
- New P1+ screens join the shell by adding a page under `(shell)` and a navigation entry gated by the matching capability.
- The E2E suite needs the local stack, including Mailpit. CI passes `MAILPIT_API_URL`.

## Rollback
Presentation and routing only. Reverting restores the earlier pages. No data, authorisation or RLS behaviour depends on this change.
