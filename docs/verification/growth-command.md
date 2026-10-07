# Growth Command visual verification

Route: `/v/[ventureId]/command/growth-1m`.
Reference: [Figma 29:1087](https://www.figma.com/design/rqWc0iFUFSTdudXuO4Gm47/Director-xo?node-id=29-1087).
All work and captures are local.

## Captures and comparison

- [Desktop 1440×900](growth-command/desktop-1440x900.png)
- [Desktop full page](growth-command/desktop-full.png)
- [Mobile 412×839](growth-command/mobile.png)
- [Mobile full page](growth-command/mobile-full.png)
- [Exact Figma reference](growth-command/figma-29-1087.png)
- [Figma workspace reference](growth-command/figma-desktop.png)

Desktop was compared directly with node 29:1087. The approved shared shell remains 220px wide with a 48px top bar. The workspace uses 32px gutters, four revenue cards, the recommendation banner, six model cards, the trajectory/levers split and the five-row execution table. Corrections cover title/panel spacing, explicit text line heights, badge/table typography, original chart assets, chart paint order and source colours. The execution panel is 364px high. Growth assets load locally at their original SVG dimensions; chart scaling preserves their proportions.

Mobile was inspected against the same screen and Figma responsive guidance (54:24043); no separate Growth Command mobile frame was supplied. It retains 16px gutters, two-column metric/model cards, stacked panels, the approved menu and a keyboard-focusable horizontal execution-table scroll region. Model cards allow wrapped labels without losing bottom padding; progress remains 61.2%. Neither capture has page-level horizontal overflow or broken Growth assets.

## Deliberate differences

- The approved Command Centre shell replaces the screen's older embedded sidebar, sample avatar and goal widget.
- Fixed sample-data labels replace Live Model, relative freshness, AI and validated-confidence claims.
- Unbuilt scenario, input and execution controls remain disabled/marked. “View execution plan” navigates to the fixture table; it does not create a plan.
- The assumptions panel exposes the source fixture, calculation and the inconsistent March 2027 / 17-month source copy. Real venture tasks remain in a separately labelled disclosure below the fixture notice.
- The first priority number uses a slightly brighter blue to pass contrast checks. Metric description markup is semantic without changing its layout.
- Mobile adapts the desktop composition; it is not claimed as a pixel match to a separate mobile Figma screen.

## Focused checks

Using the existing local dev server and unchanged `playwright.config.ts`:

- Growth Command desktop/mobile render, asset, overflow, navigation, assumptions and axe checks: **2 passed**.
- Growth Command desktop/mobile outsider-denial checks: **2 passed**.

Only Growth Command render/permission checks were run during final verification. No additional module, ADR, config or backend architecture was added during this verification pass.

## Earlier verification limitations, kept separate

Earlier runs encountered cold dev compilation timeouts, a sandbox TypeScript process crash and incorrect environment setup in the previous temporary compiled-app test configuration. Those are not evidence of a Growth Command layout defect; no further harness investigation was performed in the final verification pass.

The original broad image assertion also included missing `chevron-down.svg` and `plus.svg` references in the closed, pre-existing task form. The focused render assertion checks this screen's Growth assets. Those unrelated task-form icon references remain untouched.

Visual verification is complete for the labelled local fixture presentation. Production data, scenarios and growth execution are not complete. Nothing was pushed, merged or deployed.
