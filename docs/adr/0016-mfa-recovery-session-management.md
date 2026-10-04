# ADR-0016 — MFA, account recovery and session/device management

- Status: Accepted (P0 step 6)
- Date: 2026-10-04

## Context
Spec §8 makes `/auth/mfa` (54:27145), `/auth/session-expired` (54:27222), `/auth/reset-password/success` (54:27280) and `/settings/profile-security` (33:3534) P0 screens. §12 lists "MFA setup and recovery" and "Session and device management", and §20 requires MFA. ADR-0009 deferred TOTP to this step and fixed the session model: opaque database sessions with a 7-day idle and a 30-day absolute lifetime, no refresh tokens, and a 15-minute freshness window for sensitive operations.

## Decision

### Factor and storage
- **TOTP only** (RFC 6238: SHA-1, 6 digits, 30 s), through the Better Auth two-factor plugin. There are no email or SMS one-time codes. `/two-factor/send-otp` and `/two-factor/verify-otp` are disabled paths.
- **Ten single-use recovery codes** ("backup codes" in the UI, as in Figma), in the form `abcde-12345`.
- The TOTP secret and the recovery codes are encrypted by Better Auth with the auth secret before storage in `two_factors`. Like the other identity-store tables, `two_factors` has FORCE RLS, and only `dxo_auth` has grants. `dxo_app` cannot read it, even for the owning user (RLS test).
- The secret is shown once, during enrolment, as a QR code and a manual key. `/two-factor/get-totp-uri` is disabled, so nothing can read the secret back later.
- The QR code is drawn in the page from the URI with `uqr` (zero dependencies, pinned). No image service ever sees the secret.

### Enrolment
- Enrolment starts by re-checking the password. The factor stays unconfirmed (`verified = false`) and inactive until a first valid code arrives.
- Confirming signs out every other session and rotates the current one. Sessions opened with the password alone must not outlive the change.
- Optional, not mandatory. The spec requires MFA to be available; it does not require MFA for any role. Enforcing it for Owners is a later policy decision.

### Sign-in challenge
- For an MFA account, a correct password creates no session. Better Auth discards the first-factor session and issues a signed `dxo.two_factor` cookie, valid for 10 minutes. The login action redirects to `/auth/mfa`, carrying the validated `next`.
- `/auth/mfa` requires that cookie and redirects to `/auth/login` without it. The page decides nothing. Each submission validates the challenge (signature, expiry, attempts) on the server.
- Limits:
  - 5 wrong codes end a challenge.
  - 10 consecutive failures across challenges lock the factor for 15 minutes (Better Auth account lockout).
  - Per-IP rate limits apply to every `/two-factor/*` endpoint (`RATE_LIMITS`).
- **Replay protection (RFC 6238 §5.2).** Better Auth accepts a valid code any number of times within its window. DirectorXO records a hash of (user, code, time step) in `auth_consumed_tokens` before verification and refuses the same code for the next two steps. Recording happens before the code is checked, so a correct code is burned only by a request that would have used it. The audit reason for a refused replay is `CODE_REPLAYED`.
- **No "Trust this device".** Figma 54:27145 shows "Trust this device for 30 days". Better Auth stores trusted devices as verification rows that cannot be listed or revoked per device. Offering it would create a credential the user cannot see in device management. `trustDevice` and `disableSession` are rejected (400), so every sign-in to an MFA account presents the second factor. This is design-sync item 19.

### Weakening operations
- Turning MFA off and regenerating recovery codes require the password **and** a sign-in within the 15-minute freshness window (`SESSION_NOT_FRESH`, 403).
  - In Better Auth 1.7, `sensitiveSessionMiddleware` checks freshness on neither endpoint, so DirectorXO enforces it in its `before` hook. This covers both HTTP calls and server actions.
  - The UI offers "Sign in again", which signs out and returns to Profile & Security.
- A password reset never removes MFA. Recovery without the authenticator is by recovery code only. Support-assisted MFA reset needs the time-bound, audited support access of spec §15 and is not part of P0.

### Session expiry and device management
- A request with a session cookie but no valid session goes to `/auth/session-expired`. This covers idle or absolute expiry and revocation from another device. A visitor without a cookie goes to `/auth/login`. In both cases the validated `next` survives sign-in. The page states the real policy (7 days idle, 30 days absolute). Figma's "30 minutes of inactivity" and "drafts encrypted in this browser" are not true of DirectorXO and are not shown.
- Device lists read the identity store directly (`listActiveSessions`).
  - Better Auth's `/list-sessions` refuses any session older than the freshness window, which would hide devices from a normal long-lived session.
  - Revocation still goes through Better Auth `revokeSession`, so it is audited, after an ownership-checked token lookup (`sessionTokenFor`).
- Device labels come from the User-Agent ("Chrome on macOS") and are display only. No geo-IP lookup is made. The IP address recorded at sign-in is shown instead of Figma's city.

### Audit and notices
- Audit events (`auth.mfa.*`): `challenge_issued`, `verified` (method, stage), `failed` (method, stage, reason), `enrolment_started`, `enabled`, `disabled`, `recovery_codes_regenerated`, `change_failed`.
- `auth.login.succeeded` records the second factor used. The discarded first-factor session is not reported as a revocation.
- Users get security notice emails when MFA is turned on or off, when recovery codes are regenerated, and when a recovery code is used. Emails never contain codes or secrets.

### Account settings shell
`/settings/*` is account-level (spec §5). It reuses the application shell with no venture in context: the switcher lists the user's active ventures, and navigation shows only Profile & Security until Notifications and Billing ship. Profile & Security is also linked from the account menu and from the System section of the venture shell.

## Alternatives considered
- **Email OTP as a second factor.** Rejected: email is also the password-recovery channel, so it would not be an independent factor.
- **WebAuthn/passkeys now.** Figma shows a Passkeys row. Passkeys are not in the spec's P0 scope and need their own enrolment and recovery design. The row is not built (design-sync 20).
- **Better Auth trusted devices.** Rejected for the reasons above.

## Consequences
- Rotating `AUTH_SECRET` makes stored TOTP secrets and recovery codes undecryptable. Rotation must use Better Auth's versioned `secrets` option, which keeps the previous secret for decryption. Otherwise MFA users must re-enrol. ADR-0009's rotation note now covers MFA.
- `auth_consumed_tokens` grows by one row per submitted TOTP code. The rows expire after 90 seconds and fall under the same expired-row purge as other consumed tokens (ADR-0009). That maintenance job is still to be scheduled with the P0 worker.
- Local and E2E: the Playwright dev server builds into `.next-e2e` (`NEXT_DIST_DIR`), because Next.js locks a dist directory per dev server and journeys must run beside a developer's `next dev`.

## Rollback
- Migrations 0008/0009 only add `two_factors`.
- Removing the plugin restores password-only sign-in. Users with `two_factor_enabled = true` would then sign in with their password alone, so roll back only together with an update that sets the flag to false and a notice to the affected users.
