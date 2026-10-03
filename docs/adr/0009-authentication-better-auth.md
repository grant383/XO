# ADR-0009 — Authentication with Better Auth

- Status: Accepted (decision D1); implementation in P0 step 3
- Date: 2026-10-03

## Decision
Better Auth provides credentials, email verification, password reset, TOTP MFA (with recovery codes) and database-backed sessions.

- Browser sessions use secure, HttpOnly, SameSite cookies referencing revocable server-side sessions. No long-lived JWT bearer tokens are exposed to the browser.
- The Better Auth **organizations plugin is not used**. Venture membership, RBAC and RLS are DirectorXO domain code (ADR-0007).
- Better Auth connects as `dxo_auth`, which can read/write identity tables and append account-level audit events only.
- Better Auth's built-in schema check validates our Drizzle tables at startup.
