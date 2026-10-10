# Scheduling — local review

Reference: [Figma 14:438](https://www.figma.com/design/rqWc0iFUFSTdudXuO4Gm47/Director-xo?node-id=14-438).
Route: `/v/[ventureId]/operate/schedule`.

The route follows the spec, matrix row 39 and the Figma map. The Figma route label `/operate/scheduling` is a design-sync item only.

The exact design context and screenshot were pulled before implementation. The page renders the following inside the shared CommandShell:
- the week switcher;
- four metric cards;
- the team-by-day calendar (five team members, Monday to Friday);
- the capacity heatmap;
- scheduling alerts.

The two 10×10 chevrons are stored under `public/ui/schedule/`. Neither is byte-identical to an existing asset. No temporary Figma asset URLs remain.

## Access and states

The page resolves the signed-in actor and active venture through the existing access resolver, then checks the new `scheduling:view` capability (Owner/Admin/Manager/Operator). Viewer, outsider and unknown-venture requests receive no schedule data. Shell navigation receives the Scheduling link from the server. Viewers see a disabled entry titled “Operator access required”.

| State | Behaviour |
|---|---|
| Loading | Covered by the venture shell loading boundary |
| Error | Covered by the venture shell error boundary |
| Empty (week without samples) | “No sample jobs this week” with a Back to sample week action |
| Empty (no schedule data) | The same empty state, without the return action |
| Empty (day with no bookings) | Blank cell, announced as “No bookings” |
| No alerts | “No scheduling alerts this week.” |

## Interactions

Nothing is fetched or saved; the week switcher works in the browser.
- **Previous and next week:** move one week at a time. The week label is announced through a polite live region.
- **Sample week:** only the week of 31 Aug 2026 has sample bookings. Every other week shows the empty state, whose action returns to the sample week.
- **Keyboard:** the calendar and heatmap scroll horizontally inside their cards and are keyboard-focusable. On narrow screens the team column stays pinned while the days scroll.
- **Truncated text:** booking chips and alerts that truncate expose their full text through `title`.

## Accessibility

- **Calendar:** a real table, with team members as row headers and days as column headers. Each booking chip carries its type as visually hidden text (“Project:”, “Service visit:”, “Flagged:”, “Internal:”), so colour is not the only signal.
- **Heatmap:** a table with visually hidden day headers. Each bar carries its level (Full, Part, Over, Unbooked) as text.
- **Alerts:** severity is text (HIGH, WARN, LOW), not colour alone.
- **Scroll containers:** both are `position: relative`, so their visually hidden text cannot escape and widen the mobile layout viewport (the CRM defect).

## Data and labelling

Samples are labelled in three places:
- the title (“· Sample data”);
- the shell (“Fixed Figma fixture”, “Sample data”);
- an expandable source-notes section.

No job, scheduling or Google Calendar source is connected. No backend system, API (`/api/v1/schedule`), migration or persistence was added.

## Differences from Figma

- **Dates corrected:** Figma labels the week “Week of 1 Sep 2026” with columns Mon 1 Sep to Fri 5 Sep, but 1 Sep 2026 is a Tuesday. Week navigation needs real dates, so the sample week is shown as “Week of 31 Aug 2026”, Mon 31 Aug to Fri 4 Sep. The booking content of each weekday is unchanged.
- **Week switcher placement:** the reference puts it in the top bar. It sits at the right of the page title row instead, because it drives the page content and the shared shell top bar is shell-owned. The buttons have a 24px minimum height on desktop and 36px on mobile, larger than the reference, for target size.
- **Booking legend added:** a small legend above the calendar (Project, Service visit, Flagged, Internal) names the four booking colours, which the frame leaves unexplained. The names are inferred from the bookings: blue for multi-day or project work, green for service visits, amber for the unassigned job and training, grey for office time.
- **Empty cells:** David's empty Wednesday and Friday cells are 100px fixed-height frames in the reference, which makes his row tall. Here they size to the row.
- **Heatmap columns:** the reference heatmap clips after Wednesday because five 200px columns do not fit beside the 400px alerts panel. All five days are shown, with bars at 70% of each cell as in the reference.
- **Contrast:** the HIGH severity text is lightened from #ef4444 to #f87171 for AA contrast at 11px, with the red border kept. This matches the lightened blue on CRM, Growth and Technology.
- **Inconsistent samples:** the reference figures do not reconcile. These are preserved and disclosed in the source notes:
  - the calendar shows 21 job bookings (excluding internal time) against “Jobs this week: 32”;
  - it shows one unassigned job against “Unassigned: 3”;
  - the heatmap marks Tom over capacity on Wednesday, and an alert calls him double-booked Wed/Thu, although the calendar shows one booking on each of those days.
- **Static content:** bookings cannot be dragged, reassigned or opened, and alerts create no tasks. The frame shows no such controls, and live assignment and conflict resolution need the scheduling API.
- **Shell:** the shared shell keeps its longer navigation, venture switcher and account menu. Scheduling sits between Operations and Growth, following the frame's order.
- **Mobile:** the reference has only a desktop frame. On mobile:
  - metrics become two columns;
  - the week switcher spans the width with larger buttons;
  - the calendar and heatmap scroll inside their cards, with the calendar's team column pinned;
  - the panels stack;
  - alert text wraps.

## Visual review

The desktop 1440×900 capture was compared directly with the exact Figma screenshot (`figma-14-438.png`). The following match the reference:
- the calendar spans the full 1156px content width with a 156px team column, which the E2E test asserts;
- the alerts panel is 400px wide and the heatmap keeps its content height;
- the heatmap name column is 156px, asserted on desktop and mobile. It is set with `<colgroup>`, because the visually hidden header row cannot size a fixed-layout table; an earlier capture clipped the utilisation figures;
- metric cards: 16px padding, 11px labels and 24px values in #8e93a4, with Unassigned in amber;
- booking chip colours, borders and 11px text;
- heatmap bar colours and legend;
- the severity pills.

The mobile Pixel 7 captures are 1082px wide, which is 412 CSS px at device density. The E2E test asserts that the layout viewport equals the device width, with no document overflow, in four places:
- at first render;
- in the empty week;
- after opening the notes;
- after scrolling the calendar.

Artifacts:
- [Figma reference](operate-schedule/figma-14-438.png)
- [Desktop 1440×900](operate-schedule/desktop.png), [full page](operate-schedule/desktop-full.png)
- [Mobile](operate-schedule/mobile.png), [full page](operate-schedule/mobile-full.png)

## Validation

Run on 2026-10-10. Only the checks below were run; the full Playwright suite and unrelated database tests were not.

- TypeScript (`pnpm typecheck`): passed.
- Focused unit tests (Scheduling, CRM, CommandShell, RBAC, loading coverage): **94/94 passed**. Scheduling coverage includes:
  - the Operator+ boundary;
  - the labelled render with corrected weekday headers;
  - booking-type and heatmap-level text alternatives;
  - both empty states;
  - week arithmetic across month and year boundaries without time-zone drift or the “Sept” abbreviation;
  - fixture counts that back the disclosed notes.
- Scheduling-only Playwright: **4/4 passed** on desktop and mobile. Coverage includes:
  - render and accessibility;
  - chevron asset loading and geometry;
  - desktop calendar and alerts geometry;
  - device-width layout;
  - week navigation, the empty state and Back to sample week;
  - source notes;
  - mobile keyboard calendar scroll with the pinned team column;
  - the mobile menu;
  - Operator admitted; Viewer, outsider and unknown venture denied.
- Axe checks passed on the screen, the empty week, the expanded notes and the tested permission states. The first run failed axe on the HIGH pill contrast, which was fixed as described above.
- Changed-file ESLint: **0 errors**, with advisory Next.js `<img>` warnings for local SVGs only.

Complete for local review. Nothing pushed, merged or deployed. Live jobs, team rosters, assignment, conflict detection, capacity calculation and Google Calendar sync remain outside this sample-screen slice.
