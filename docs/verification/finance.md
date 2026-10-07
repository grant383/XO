# Operate Finance visual verification

Route: `/v/[ventureId]/operate/finance`.
Reference: [Figma 10:3179](https://www.figma.com/design/rqWc0iFUFSTdudXuO4Gm47/Director-xo?node-id=10-3179).
Work and captures are local.

## Design and implementation

The exact high-fidelity design context and screenshot were pulled before implementation. The page uses the approved Command Centre / Growth Command shared shell, existing Geist fonts and Geist Mono, and the existing server-side actor and active-venture membership resolution. Viewer+ can read the page; inaccessible ventures receive the existing no-access state before any fixture is rendered.

The existing billing module manages DirectorXO subscription accounts, Stripe checkout and entitlements. It does not provide operational receivables, supplier liabilities, cash, quotes, budgets or reconciliation, so none of its figures are repurposed. No schema, migration, API, financial integration or backend service was added. Command Centre source metrics remain unchanged.

Fixed fixtures reproduce all four metrics, six chart groups, four payable rows, five invoices and four ratios. A collapsed disclosure contains independent transaction, quote, budget and reconciliation samples and explains their provenance. Those supplemental samples are not a ledger supporting the reference totals. The payable rows sum to £6,800; the invoices sum to £12,400. The source chart supplies geometry without a numeric axis; its bar heights are not represented as financial amounts.

## Captures and direct comparison

- [Desktop 1440×900](finance/desktop.png)
- [Desktop full page](finance/desktop-full.png)
- [Mobile 412×839](finance/mobile.png)
- [Mobile full page](finance/mobile-full.png)
- [Exact Figma reference](finance/figma-10-3179.png)

Compare the Figma workspace after excluding its outer presentation canvas (80px left, 56px top). Desktop uses the approved 220px sidebar and 48px top bar, 32px content gutters, four 85px metric cards and a 24px panel gap. The chart panel is at (252, 284), 732×230; payables at (252, 538), 732×250; receivables at (1008, 284), 400×372; ratios at (1008, 680), 400×208. The focused browser test asserts those exact bounds.

Initial captures exposed border offsets and text line-height differences. Inset borders and explicit Geist line heights corrected the card and panel geometry. The title's sample label was then given its own line height to remove a further 3px baseline offset. Chart assets are non-empty local SVG files at their original dimensions: three 530×1 grid lines, five 2px-high balance segments, six 6×6 points and a 10×10 period chevron. Fractional segment widths are retained in CSS and checked through computed dimensions. Bars and asset slots match the original layer placement and paint order.

Mobile adapts this desktop reference: two-column metrics, stacked panels and keyboard-focusable horizontal chart/table regions. It retains all source months and columns, no page-level horizontal overflow and the approved menu. No separate mobile Finance frame was supplied, so this is a responsive adaptation rather than a claim of a separate mobile pixel match.

## Deliberate differences

- “Finance · Sample data” and fixed-period copy replace “Live Finance”, “real-time” and relative calculation freshness. No live GS Appliance financial figures are fabricated.
- The approved shared shell replaces the older embedded sidebar and fixture avatar. The venture and account identity come from authenticated access.
- The period is a fixed sample label rather than an enabled selector with unavailable periods.
- Muted text uses the existing accessible #9eabbf token. Semantic tables, headings and chart description replace prototype-only markup.
- Sample source notes are available in a collapsed disclosure below the reference panels. No samples are persisted; the entire Finance presentation is read-only.

## Validation

Focused Finance browser checks cover desktop/mobile render, exact desktop panel geometry, asset loading and dimensions, viewport overflow, sample-source disclosure, mobile keyboard scrolling and menu navigation, Viewer access, outsider/unknown-venture denial, and WCAG 2.2 AA serious/critical axe checks. Checks use the existing Playwright configuration and the real local sign-in/invitation flows.

The full focused suite passed **4/4** after the layout correction. After preserving fractional SVG widths, final desktop and mobile render/accessibility recaptures each passed **1/1**. Asset widths are checked within 0.05px to accommodate Chromium subpixel quantization (80.89px renders as 80.875px). Earlier exact-geometry verification exposed the 3px title offset described above; it was corrected before completion. Focused ESLint passed with only Next.js recommendations for the small SVG image elements. No broad test suite, build or architecture checks were run; validation stays within the requested Finance scope.

Nothing was pushed, merged or deployed. Operational live data and financial mutations are outside this local fixture implementation.
