# ADR-0009 — Authentication with Better Auth

- Status: Accepted (decision D1); implemented in P0 step 3; TOTP MFA implemented in step 6 (ADR-0016)
- Date: 2026-10-03 (updated 2026-10-04 with step 3 implementation decisions)

## Context
Spec §20 requires secure HTTP-only same-site browser sessions, CSRF protection, rate limiting, credential-stuffing protection and immutable audit logs. Spec §14 versions every API under `/api/v1`. Venture tenancy, membership and RBAC are DirectorXO domain concerns (ADR-0007).

## Decision
Better Auth (1.7.7) provides identity and session primitives only: credentials, email verification, password reset and database-backed sessions. TOTP MFA follows in P0 step 6.

- The **organizations plugin is not used**. Venture membership, RBAC and RLS remain DirectorXO domain code (ADR-0007).
- Better Auth connects as `dxo_auth` through `src/platform/db/identity-store.ts`. That role can reach identity tables (`users`, `sessions`, `accounts`, `verifications`, `auth_consumed_tokens`) and append account-level audit events only. `dxo_app` has no privileges on sessions, credentials or verification values.
- Configuration lives in `src/modules/identity`. Policy values are in `policy.ts`, and changing any of them requires updating this ADR.

### Routes
- API: `/api/v1/auth/*` (Better Auth `basePath`). Every response gets an `x-correlation-id` and `Cache-Control: no-store`.
- UI: `/auth/register`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email`. These are server actions calling `src/modules/identity/flows.ts`, which calls `auth.api`, so the API and the UI share one path.
- Unused endpoints are disabled: social/OAuth, account linking, change-email, delete-user, update-session, verify-password, and the GET reset-password callback.

### Sessions
- Opaque database sessions referenced by a **signed** HttpOnly cookie `dxo.session_token`. Under TLS the cookie is `Secure` and named `__Secure-dxo.session_token`; this is always the case in production, where env validation requires an https `APP_URL`.
- `SameSite=Lax`: sent on top-level navigation from email links, withheld on cross-site POSTs. Origin validation is **forced on**: `disableOriginCheck` and `disableCSRFCheck` are explicitly `false`, because Better Auth disables both by default when `NODE_ENV=test`.
- No cookie cache. Every request is checked against `sessions`, so revocation is immediate.
- Lifetimes:
  - idle (sliding) expiry: 7 days, extended at most once per day;
  - absolute lifetime: 30 days. A refresh can never extend `expires_at` beyond `created_at + 30d` (a `session.update` hook), and `getSession()` rejects and revokes sessions past it;
  - freshness window for sensitive operations: 15 minutes.
- Rotation: every sign-in issues a new token, and pre-set cookies are ignored (no fixation). Changing the password revokes all sessions and re-issues the current one. A password reset revokes all sessions.
- Session tokens are never sent to browser scripts. They are stripped from every HTTP JSON body (sign-in, sign-up, get-session, list-sessions, change-password). No bearer plugin is enabled, so the raw token is not a credential without the cookie signature.
- `getSession(headers)` in `@/modules/identity` is the only server-side entry point for authentication.

### Tokens
- Password-reset tokens: database rows, identifiers stored **hashed**, single-use (atomic consume), 30-minute TTL. A successful reset deletes all other outstanding reset tokens for that user.
- Email-verification tokens: Better Auth issues stateless JWTs (24-hour TTL), which are not single-use by design. **Deviation:** DirectorXO records a SHA-256 hash of each token in `auth_consumed_tokens` on first use (insert-only for `dxo_auth`) and rejects replays. Verification does not sign the user in.
- Email links open DirectorXO pages, which consume the token only on an explicit POST, so link-scanning mail gateways cannot burn it. These pages send `Referrer-Policy: no-referrer`.

### Account enumeration
- Duplicate registration returns a synthetic success response, identical in shape and with a UUID id. The existing owner receives an "already have an account" email.
- Forgot-password and resend-verification always return the same response.
- A wrong password and an unknown account return the same 401. An unverified email is reported only after a correct password.
- Emails are sent as background tasks after the response, so response time does not reveal whether an account exists.

### Rate limiting and credential-stuffing protection
- **Deviation:** Better Auth's built-in limiter is disabled. DirectorXO enforces limits in a Better Auth `before` hook, which, unlike the built-in limiter, also covers server actions calling `auth.api`.
- Storage is Redis, with an atomic Lua `INCR`/`EXPIRE` script (`src/platform/security`).
- Per-IP rules apply per endpoint. A catch-all limit covers other HTTP endpoints, but not trusted server-side session reads.
- Per-account rules are keyed by an HMAC of the email, so no personal data is stored. They cover registration, password reset and verification resend.
- **Login lockout:** 5 failed sign-ins per account in 15 minutes block sign-in for that account, even with the correct password, until the window ends. The response is identical for existing and unknown accounts, and a successful sign-in clears the counter.
- Client IP comes from the rightmost hop of `CLIENT_IP_HEADER` (default `x-forwarded-for`), which is the value a single trusted proxy appends. Requests without a valid IP skip per-IP limits instead of sharing one bucket; per-account limits still apply.
- If Redis is unavailable, limiting **fails open**. The failure is logged at error level and reported by `/api/health/ready`.

### Audit (ADR-0008)
Account-level events (`venture_id IS NULL`) are written by `dxo_auth`:
- registration and duplicate-email attempts;
- email verification, success and failure;
- login: success, failure, lockout and blocked;
- logout;
- session creation, revocation (with reason) and expiry;
- password reset: request, completion and failure;
- password change and failed change;
- profile update;
- rate limiting (first rejection per window).

Metadata never contains passwords, tokens or raw email addresses; anonymous failures carry the HMAC `accountKey`. Audit write failures are logged at error level and do not block authentication.

### Logging
Better Auth's logger is bridged to pino through a scrubber that removes email addresses, JWTs and token parameters (Better Auth logs some messages with raw emails). Pino also redacts password, token, cookie and authorization fields.

### Email
`src/platform/email` provides SMTP (Mailpit locally), SendGrid (v3 REST, with click/open tracking disabled so token links are never rewritten) and memory (tests only) transports. Production requires SendGrid.

### Profile identity foundation
Profile reads go through `withUser` (`dxo_app` plus RLS: self or co-members). Only `name` can be updated, through Better Auth `/update-user`. Users can list sessions (without tokens) and revoke one or all others.

## Consequences
- Rotating `AUTH_SECRET` invalidates every session and outstanding verification link, and makes stored TOTP secrets and backup codes undecryptable unless the previous secret is kept through Better Auth's versioned `secrets` option (ADR-0016).
- Lockout can be triggered against a known address by a third party (a bounded 15-minute denial of service). MFA (step 6) and, if needed, CAPTCHA on repeated lockouts are the mitigations.
- Verify/reset tokens travel in query strings, so edge or proxy access logs that record full URLs will contain them. Exposure is bounded by single use and short TTLs. Moving tokens into the URL fragment would remove this but requires JavaScript; to be revisited with the Figma auth screens.
- Session tokens are stored in plaintext in `sessions` (Better Auth design), reachable only by `dxo_auth`.
- Browser-side `/revoke-session` cannot be used, because tokens are not exposed. Session revocation in the UI goes through server actions.
