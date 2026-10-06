# ADR-0018 — Account notifications and venture activity

- Status: Accepted
- Date: 2026-10-07

## Decision

Notifications & Activity (`/settings/notifications-activity`, Figma 33:3910) projects new account audit events into a persistent inbox. The database trigger copies only the event identifier, action and timestamp, with a unique event/user constraint. It never copies audit metadata, credentials, IP addresses or device information. Historical audit events remain available in the audit store; migration 0011 does not manufacture historical inbox notifications.

FORCE RLS independently restricts inbox reads and read-state updates to the signed-in account. Runtime grants permit updating only `read_at`; creation and deletion are not exposed. Marking read uses the displayed cutoff, so concurrent arrivals remain unread, and retries are safe. REST and server actions call the same module; the REST boundary requires authentication, exact Origin for writes, rate limits and bounded JSON bodies.

Venture activity is a separate audit query. Every request resolves an active membership with `team:view` (Owner/Admin), then queries under venture RLS. Permission revocation takes effect on the next request. The response contains safe action labels, outcomes and UTC timestamps, without audit metadata. Account inbox access never grants venture access.

The approved screen uses real events, counts, All/Unread filtering, pagination, empty/loading/error states and offline/pending read controls. Exact Figma SVGs and existing design tokens are reused. No sample business/AI alerts or scheduled email digest are represented as available. Verification, recovery and invitation delivery remain in their existing modules.

## Recovery

Migration 0011 is additive. An application rollback preserves notification and audit records. Do not drop them as part of an application rollback. Staging release and recovery evidence remain separate P0 gates.
