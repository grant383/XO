# Operate Operations — local implementation, verification blocked

Route: `/v/[ventureId]/operate/operations`.
Reference: [Figma 10:3462](https://www.figma.com/design/rqWc0iFUFSTdudXuO4Gm47/Director-xo?node-id=10-3462).

The exact high-fidelity design context and its screenshot were pulled before editing. The [reference PNG](operations/figma-10-3462.png) is saved locally. The page reproduces the four metric cards, eight-row job board, seven-person field-status list, revenue breakdown and capacity meter using the approved Command Centre/Growth/Finance shell. Static status dots and revenue dividers were downloaded from the exact context: 6×6, 6×6 and 352×1 SVGs respectively. The authenticated shared shell supplies account identity instead of the reference avatar.

The page resolves the signed-in actor and selected active venture under existing RLS, then checks the canonical `operations:view` capability (Owner/Admin/Manager/Operator only) before rendering sample records. Navigation receives this permission from the server and displays a disabled Operator-access label for Viewers. Loading and errors inherit the venture shell states. No new persistence, API, migration, service, integration or operational mutation was added.

The existing Command tasks are action items, background jobs are infrastructure work, and team memberships are authorization records. None represent field dispatch or availability. No operational asset domain is implemented or shown by this frame, so these features were not repurposed. Fixed fixtures are labelled “Sample data” in the title and shell, with source notes below the panels; no live GS Appliance records are fabricated. There are no action controls in this Figma frame. Other unshipped shell destinations remain visibly disabled.

The Figma samples are inconsistent: the board has two completed, three in-progress and three scheduled jobs, while the Completed card says four. Seven people appear, with four on-site, two available and one off-duty, while the deployment card says 5/7. These design samples are preserved with an explicit explanation in the disclosure. Job values sum to £5,470 (completed £500, in-progress £4,285, scheduled £685). Booked value is not recognised revenue or cash collected.

The responsive implementation uses two-column metrics, stacked lower cards and a keyboard-focusable horizontal job table on mobile. Muted text uses the existing accessible #9eabbf token and blue status text is lightened for contrast. These choices have not yet been browser-verified.

## Validation and stop condition

- Focused Operations unit tests: **2/2 passed** (Operator+ role boundary and semantic labelled sample render).
- Focused ESLint: **0 errors**, small-SVG `<img>` recommendations only.
- `git diff --check`: passed.
- Focused Playwright Operations suite: first desktop render test failed **before visiting Operations**. Public sign-up returned 200, then the existing `latestEmail` helper timed out after 15 seconds waiting for a verification email in Mailpit (`tests/e2e/helpers.ts:47`). Initial sandbox execution also could not start the local server; enabling local port/database execution allowed the suite to start.

The run was stopped (exit 130): one desktop test failed in verification-email setup, the desktop permission journey was interrupted during onboarding, and both mobile tests did not run.

Per the user's instruction to stop if unrelated test infrastructure becomes flaky, no email-worker or test-harness debugging was attempted. Desktop 1440×900 and mobile captures, direct browser/Figma comparison, final visible-mismatch fixes, and browser permission/axe results are **incomplete**. The screen is not marked complete. The focused browser tests are checked in for the next verification run; no authenticated bypass or alternative harness was introduced.

All work remains local. Nothing was pushed, merged or deployed. Full live operational CRUD and real source connection remain outside this reference-screen slice.
