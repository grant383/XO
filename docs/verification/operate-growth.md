# Operate Growth — local review

Reference: [Figma 10:3734](https://www.figma.com/design/rqWc0iFUFSTdudXuO4Gm47/Director-xo?node-id=10-3734).
Route: `/v/[ventureId]/operate/growth`.

Exact design context and screenshot were obtained before implementation. The four metric cards, acquisition funnel, five top clients, revenue trend and growth levers use fixed, labelled Figma samples. The exact chart SVG is stored locally at `public/ui/operate-growth/revenue-trend.svg` (548×141); no temporary asset URLs remain in the implementation. Account identity and venture name continue to come from the shared shell rather than the reference's fictitious identity.

The page independently resolves the signed-in actor and active venture through the existing access resolver, then checks the canonical `growth:view` capability (Owner/Admin/Manager/Operator). Viewer, outsider and unknown-venture requests do not receive Growth records. Shell navigation receives its Growth permission from the server. The existing £1M Growth Command stays accessible under its explicit name; Growth now links to the Operate route. Other unimplemented destinations remain visible and disabled. This Figma frame contains no action controls.

Samples are identified in both the title and shell, with expandable source notes. No live GS Appliance growth or pipeline records are fabricated. The April 2026 samples are fixed and never saved; the design's “Last calculated 2 min ago” is replaced with truthful sample labelling. Conversion labels reconcile to the displayed funnel. The chart has no numeric revenue series; lever bars are illustrations rather than comparable performance percentages. No backend system, API, migration or persistence was added.

## Visual review

Compared the desktop 1440×900 capture and mobile Pixel 7 capture directly with the exact Figma screenshot. Metrics, funnel, client rows, trend asset, lever bars, card colours, 32px desktop content padding and the 400px right column follow the reference. The desktop chart retains the reference's oversized illustration, clipped within its panel to prevent page overflow. On mobile, metrics become two columns, panels stack, and the client table scrolls horizontally with keyboard access. The reference provides a desktop frame, so mobile preserves its visual hierarchy rather than matching an unavailable mobile frame.

The shared shell retains its established longer Build navigation and authenticated account menu; these pre-existing differences from the shorter Figma sidebar were not redesigned. Explicit sample labels and accessible muted/blue/red text are intentional adaptations. The source chart is not redrawn or stretched.

Artifacts:
- [Figma reference](operate-growth/figma-10-3734.png)
- [Desktop 1440×900](operate-growth/desktop.png), [full page](operate-growth/desktop-full.png)
- [Mobile](operate-growth/mobile.png), [full page](operate-growth/mobile-full.png)

## Validation

- Focused Growth unit tests: **3/3 passed** (Operator+ boundary, semantic sample render, conversion consistency).
- Focused Growth Playwright tests: **4/4 passed**, desktop and mobile render/accessibility plus Operator/Viewer/outsider/unknown-venture permission journeys.
- Axe checks passed on the screen, expanded source notes and tested permission states.
- No page-level horizontal overflow. Mobile keyboard table scrolling and active menu navigation passed.
- Chart loaded successfully and rendered at its exact 548×141 asset dimensions on both viewports.
- Focused ESLint: **0 errors**, three advisory Next.js image warnings for local SVG images.
- `git diff --check`: passed.

Initial sandbox browser execution could not start the local server. The authorized local server/database run then passed with the existing auth/email harness; no infrastructure debugging or bypass was needed.

Complete for local review. Nothing pushed, merged or deployed. Real growth/pipeline connections remain outside this sample-screen slice.
