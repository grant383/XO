# ADR-0014 — UI foundations: design tokens, components and E2E

- Status: Accepted (P0 item 1, application shell/design foundations)
- Date: 2026-10-04

## Context
Spec §12 lists the global application shell and design foundations as P0. The definition of done (spec §22) requires each screen to match its approved Figma frame, with responsive states, accessibility (WCAG 2.2 AA, spec §Accessibility) and Playwright E2E. Until now the P0 screens used a deliberately unstyled presentation with no CSS, no `src/ui` and no E2E tooling. ADR-0006 already reserves `src/ui/` for "design tokens and components (from approved Figma)".

The approved sources are the Figma file `rqWc0iFUFSTdudXuO4Gm47`: DirectorXO Foundations v2 (54:15162), Controls v2 (54:15538), Product Patterns v2 (54:15959) and the screen frames listed in `DIRECTORXO_IMPLEMENTATION_MATRIX.md`.

## Decision

### Styling
- **CSS Modules + CSS custom properties.** No CSS framework or CSS-in-JS runtime. Figma variables become custom properties in `src/ui/tokens.css`. Names mirror the Figma variables (`surface/base` → `--surface-base`). Primitives (neutral, cobalt, amber) are defined once, and components consume only semantic roles.
- `src/ui/global.css` (imported once by the root layout) holds the reset, the body defaults, one global `:focus-visible` treatment and `prefers-reduced-motion` handling.
- **Dark only.** Figma defines a single dark theme, so the root sets `color-scheme: dark` and there is no light theme.
- Breakpoints follow Foundations v2 (sm 480, md 768, lg 1024, xl 1280, 2xl 1440). Media queries cannot read custom properties, so the values are written literally and documented in `tokens.css`.

### Fonts
Geist and Geist Mono come from the `geist` package (exact version, ADR-0005) through `next/font`. They are self-hosted, so the app makes no runtime requests to a font CDN.

### Components and assets
- `src/ui` is presentational only. ESLint forbids it from importing `@/modules/*`, `@/platform/*` or `@/app/*`, and data arrives through props. App code imports it through the `@/ui` barrel.
- Components map to Figma components: Button (Primary, Secondary, Tertiary, Danger), Text Field (with password reveal), Checkbox, Alert (Error, Warning, Success, Info), Status badge, Eyebrow, Brand and the form error summary.
- Icons are the SVG assets exported from Figma and stored in `public/ui/icons`. They are served unoptimised through `next/image` (the documented handling for SVG) at each asset's own dimensions. Icons are decorative (`alt=""`, `aria-hidden`), so adjacent text always carries the meaning.

### Accessibility rules
- WCAG 2.2 AA contrast is enforced by a unit test (`tests/unit/ui-tokens.test.ts`) over every text token and surface pair that is actually used, plus a 3:1 check on the focus ring.
- Two deliberate deviations from the Figma values:
  - Info alert titles use `cobalt-400` (`--status-info-text`). Figma's `accent/blue` measures 3.6:1 on the tinted info surface.
  - Status colours never appear on `--surface-control` (the secondary-button fill), because `status/danger` measures 4.49:1 there.
- Errors: a focusable form error summary (`role="alert"`) receives focus after a failed submit. Field errors are linked through `aria-describedby`.

### E2E
Playwright (`@playwright/test`) runs with `@axe-core/playwright`, desktop (1440×900) and mobile (Pixel 7) projects, and fails on any serious or critical axe violation. Tests run against a dedicated dev server on `:3100` with `APP_URL` pointing at it, so Better Auth origin checks pass. CI runs the suite in a new `e2e` job: it bootstraps and migrates a fresh database and generates throwaway `AUTH_SECRET` and `ENCRYPTION_KEY` values for each run.

### Copy and controls that differ from Figma
The implementation follows the spec and the enforced backend policy. Each difference is a design-sync item:
- **Login and Create account:** "Continue with secure SSO", "Remember me" and the Terms checkbox are not built. SSO is not in the spec or backend. Session lifetime is fixed by `SESSION_POLICY`. Recording terms acceptance would need versioned terms and auditable consent. Shipping inert controls would mislead users.
- **Password requirements:** the requirements panel shows the enforced policy (12–128 characters, ADR-0009), not Figma's "10+ characters, upper/lower case, number and symbol".
- **Verification link lifetime:** shown from `TOKEN_POLICY` (24 hours). Figma says 30 minutes.
- **Trust metrics:** Figma's story panel shows sample data ("£1M growth", "Balanced") and "Encryption: End-to-end". The app does not provide end-to-end encryption. The metrics are replaced by controls that exist: TLS in transit, secure auth and role-based access.
- **Failed sign-in:** Figma shows "4 attempts remaining". Revealing remaining attempts leaks lockout state, so the identity flow's non-enumerating message is shown instead (ADR-0009).

## Alternatives considered
- **Tailwind CSS v4.** Faster to assemble screens, but it adds a toolchain dependency and utility-class markup. It was rejected in favour of zero-runtime CSS Modules with the same tokens.
- **`next/font/google`.** It needs network access at build time. The `geist` package is local and pinned.
- **Inlining SVG paths as React components.** This would edit the exported assets. The Figma files are kept as delivered.

## Consequences
- Every new screen composes `@/ui` components and tokens. Raw hex values in app CSS are a review finding.
- The Figma visual and E2E coverage now exist for the auth screens. Other screens move to **Implemented** as they adopt the shell and components.
- New dev dependencies: `@playwright/test`, `@axe-core/playwright`. New runtime dependency: `geist`.

## Rollback
The change is purely presentational. Reverting `src/ui`, the auth pages and the root layout restores the previous unstyled UI, and no data or security behaviour depends on it.
