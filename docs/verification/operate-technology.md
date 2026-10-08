# Operate Technology — local review

Reference: [Figma 10:4344](https://www.figma.com/design/rqWc0iFUFSTdudXuO4Gm47/Director-xo?node-id=10-4344).
Route: `/v/[ventureId]/operate/technology`.

The exact design context and screenshot were pulled before implementation. The page has the four metric cards, the eight-row service health table, two active alerts and four system-performance rows. It uses the shared Command Centre shell. Static assets were downloaded from the exact context and stored under `public/ui/technology/`: the 5×5 operational/degraded status dots and the four sparkline vectors (120×21.46, 120.67×21.34, 120×21.5, 120×21.34). The 6×6 green metric dot is byte-identical to the existing `public/ui/command/success.svg`, so that file is reused. No temporary Figma asset URLs remain.

The page resolves the signed-in actor and active venture through the existing access resolver, then checks the new canonical `technology:view` capability (Owner/Admin/Manager/Operator, per the matrix change from the Figma Admin+ to Operator+). Viewer, outsider and unknown-venture requests receive no Technology records. Shell navigation receives the Technology link from the server. Viewers see a disabled entry titled “Operator access required”. Loading and error states use the venture shell boundaries. This Figma frame has no action controls.

The samples are labelled in the page title (“· Sample data”), in the shell (“Sample data”), in the top-bar status (“Sample status: All systems operational”) and in an expandable source-notes section. No ServiceM8, Xero, Stripe, Google Workspace, email, Zapier, HubSpot or backup integration is connected. No live GS Appliance technology records are fabricated. The reference's header claims all systems are operational while its table shows Email Delivery as degraded. This inconsistency is preserved and disclosed, not silently changed. Sparklines are the exact design illustrations with text alternatives, not plotted series. No backend system, API (`/api/v1/integrations/health`), migration or persistence was added.

## Visual review

Compared the desktop 1440×900 and mobile Pixel 7 captures directly with the exact Figma screenshot. These match the reference: the four-column metrics (32px values with status dots), the table column widths (240/160/120/150/180/fill plus 16px row inset), the bordered status pills with the reference opacity, the monospaced uptime and latency figures, the coloured health labels, the amber/blue alert cards, the 120px sparklines at exact asset size, and the 32px content padding. On mobile, metrics become two columns, the lower panels stack and the service table scrolls horizontally with keyboard access. The reference has only a desktop frame, so mobile keeps its visual hierarchy rather than matching a mobile design.

Intentional and pre-existing differences:
- The shared shell keeps its longer navigation, its venture switcher and the authenticated account menu.
- The reference's fictitious identity is not used.
- The top-bar status is labelled as a sample.
- The blue INFO tag text is lightened (#6aa4ff) for contrast, as on Growth.
- The shell hides the top-bar status on mobile, as it does for the date/period, and the “Sample data” marker remains.

Artifacts:
- [Figma reference](operate-technology/figma-10-4344.png)
- [Desktop 1440×900](operate-technology/desktop.png), [full page](operate-technology/desktop-full.png)
- [Mobile](operate-technology/mobile.png), [full page](operate-technology/mobile-full.png)

## Validation

- `pnpm typecheck`: passed.
- Focused unit tests (Technology, CommandShell, RBAC, loading coverage, Growth): **83/83 passed**.
- Technology-only Playwright: **4/4 passed** on desktop and mobile. It covers render and accessibility, asset loading and geometry, active navigation, mobile keyboard table scroll and mobile menu. It also covers the Operator (admitted) and Viewer/outsider/unknown-venture (denied) journeys.
- Axe checks passed on the screen, the expanded source notes and the tested permission states. There is no page-level horizontal overflow.
- Focused ESLint: **0 errors**, with advisory Next.js `<img>` warnings for local SVGs only.

Complete for local review. Nothing pushed, merged or deployed. Live integration health, webhooks and idempotency remain outside this sample-screen slice.
