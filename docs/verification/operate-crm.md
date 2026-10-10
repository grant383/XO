# Client CRM — local review

Reference: [Figma 14:4](https://www.figma.com/design/rqWc0iFUFSTdudXuO4Gm47/Director-xo?node-id=14-4).
Route: `/v/[ventureId]/operate/crm`.

The exact design context and screenshot were pulled before implementation. The page renders the following inside the shared CommandShell:
- the four metric cards;
- the ten-row client directory;
- client segments by revenue;
- 30-day churn risk;
- relationship metrics: NPS, a six-month satisfaction trend and next actions.

New static assets are stored under `public/ui/crm/`: the 12×12 star, the 10×10 chevron and the four 8×8 segment dots. The 5×5 active and at-risk dots and the 6×6 churn dot are byte-identical to `public/ui/technology/operational.svg`, `technology/degraded.svg` and `command/warning.svg`, so those files are reused. No temporary Figma asset URLs remain.

## Access and states

The page resolves the signed-in actor and active venture through the existing access resolver, then checks the new `crm:view` capability (Owner/Admin/Manager/Operator). Viewer, outsider and unknown-venture requests receive no client records. Shell navigation receives the Clients link from the server. Viewers see a disabled entry titled “Operator access required”.

| State | Behaviour |
|---|---|
| Loading | Covered by the venture shell loading boundary |
| Error | Covered by the venture shell error boundary |
| Empty (no clients) | “No clients yet” state |
| Empty (no matches) | “No sample clients match” state with a Clear filters action |

## Interactions

The directory is interactive in the browser. Nothing is fetched or saved.
- **Search:** filters by client name.
- **Filters:** Type and Status.
- **Sorting:** the Client, Total Spend, Jobs, Last Job and Satisfaction columns sort with `aria-sort`. Text columns sort A→Z first; numeric and date columns sort highest or latest first. Ties break by name. The default is the reference order, highest spend first.
- **Results:** the filtered count is announced through a polite live region.
- **Keyboard:** the table scrolls horizontally and is keyboard-focusable.

## Data and labelling

Samples are labelled in three places:
- the title (“· Sample data”);
- the shell (“Sample data”, next to the reference totals);
- an expandable source-notes section.

No CRM, job, review or payment source is connected. No backend system, API (`/api/v1/clients`), migration or persistence was added.

## Differences from Figma

- **Controls added:** search, filters and sortable headers do not exist in the frame. They are added in the directory title bar for the requested interactions.
- **Copy fix:** the typo “↑ +1.8% target target” is shown as “↑ +1.8% vs target”.
- **Segment bar:** in the reference it is 368px inside a 468px track. It is rendered proportionally across the full track.
- **Contrast:** Platinum tier text is lightened from #2563eb to #6aa4ff, as with blue text on Growth and Technology.
- **Panel overflow:** the reference clips its lower panels at the frame edge. They flow fully here.
- **Inconsistent samples:** the reference figures don't reconcile. 64/87 is 73.6% (shown as 73.5%), and segment revenue does not match the segment shares. These are preserved and disclosed.
- **Directory size:** the directory shows ten of the 87 sample clients.
- **Static content:** next actions are text only and create no tasks. There is no client detail view, because there is no Figma frame for it; the spec lists Client detail as a missing P1 screen.
- **Shell:** the shared shell keeps its longer navigation, venture switcher and authenticated account menu. Clients sits between £1M Growth Command and Finance, following the frame's Clients-before-Finance order.
- **Mobile:** the reference has only a desktop frame. On mobile, metrics become two columns, the controls stack full-width, panels stack, and the directory scrolls horizontally inside its card.

## Mobile layout defect (fixed)

On Pixel 7 the first run laid out at 610px instead of 412px. Mobile Chrome had widened the layout viewport, so the page rendered zoomed out and the lower panels intercepted the source-notes click. Measurements:

| Measurement | Value |
|---|---|
| Visual viewport | 412px, scale 1 |
| `innerWidth` and `html.scrollWidth` | 610px |
| Table ancestors | all ≤ 412px wide |
| Directory scroll container | clipping correctly (348px client width, 860px scroll width) |

Every absolutely positioned descendant of `main` was listed. Ten visually-hidden “out of 5” rating spans had `offsetParent = BODY` and a right edge of 610px. Because the scroll container was not positioned, they escaped its overflow clipping and widened the document.

The fix is local: `.tableScroll` is now `position: relative`, which makes it their containing block. There is no global overflow hiding and no shell change.

The old check (`scrollWidth <= innerWidth`) could not detect this, because mobile emulation also widens `innerWidth`. The spec now asserts that `innerWidth` equals the device viewport width and that the document has no horizontal overflow. It checks at first render, in the filtered-empty state, and before and after opening the source notes.

## Visual review

The desktop 1440×900 and mobile Pixel 7 captures were compared directly with the exact Figma screenshot. These match the reference:
- metric cards: 16px padding and 28px values;
- directory column widths: Type 110, Spend 110, Jobs 70, Last Job 100, Satisfaction 100, Tier 100, Status 90;
- 34px rows;
- tier and status pills;
- the 500px segments column with legend;
- churn-risk cards;
- the NPS and trend bars;
- next actions with the exact chevrons.

The mobile capture is 1082px wide at Pixel 7 density, which is 412 CSS px.

Artifacts:
- [Figma reference](operate-crm/figma-14-4.png)
- [Desktop 1440×900](operate-crm/desktop.png), [full page](operate-crm/desktop-full.png)
- [Mobile](operate-crm/mobile.png), [full page](operate-crm/mobile-full.png)

## Validation

Re-verified on 2026-10-10. Only the CRM checks below were run; the full Playwright suite and unrelated database tests were not.

- TypeScript (`pnpm typecheck`): passed.
- Focused unit tests (CRM, CommandShell, RBAC, loading coverage): **86/86 passed**. CRM coverage includes:
  - the Operator+ boundary;
  - labelled render and empty state;
  - deterministic search, filter and sort with tie-breaks;
  - money and date formatting;
  - segment shares.
- CRM-only Playwright: **4/4 passed** on desktop and mobile. Coverage includes:
  - render and accessibility;
  - asset loading and geometry;
  - device-width layout;
  - sorting, filters, search, the empty state and Clear filters;
  - source notes;
  - mobile keyboard table scroll and mobile menu;
  - Operator admitted; Viewer, outsider and unknown venture denied.

  On the first run the desktop render test timed out at `page.goto("/onboarding")` with `net::ERR_ABORTED`. That happened while the dev server was still compiling cold, before any CRM code ran. Re-run alone on the warm server, it passed in 1.6 minutes. The other three tests passed on the first run.
- Axe checks passed on the screen, the filtered-empty state, the expanded source notes and the tested permission states.
- Changed-file ESLint: **0 errors**, with advisory Next.js `<img>` warnings for local SVGs only.

Complete for local review. Nothing pushed, merged or deployed. Live client CRUD, validation, contacts, interactions and client detail remain outside this sample-screen slice.
