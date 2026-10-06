# ADR-0017 — Account support requests

- Status: Accepted
- Date: 2026-10-06

## Decision

Help & Support (`/support`, Figma 33:4290) uses the account shell and persists requests owned by the signed-in user. It does not infer a venture from browser storage or grant support personnel access to venture data. Any future support impersonation must meet spec §15 independently.

Requests include an opaque UUID, subject, description, status and UTC timestamps. Creation uses a client request UUID for idempotency; a changed payload with the same UUID is rejected. Creation and a metadata-free account audit event commit atomically. Server validation and database constraints bound the text. PostgreSQL FORCE RLS independently restricts reads/inserts to the account; runtime roles cannot change ownership, edit status or delete requests. There is no promised response SLA or external support email delivery in this slice.

The REST API and server action call the same module. The checked-in OpenAPI contract is generated from Zod schemas and checked in CI. API authentication returns JSON errors rather than redirects; writes require an exact Origin match. Correlation IDs and request latency are logged without bodies, cookies, paths containing identifiers, or exception content.

The Figma sample topics and support requests are replaced with truthful help articles and persisted account requests. Articles explicitly identify later features. Search, expandable topics/request details, pagination, pending/error/offline states and account navigation use the existing design system and exact Figma SVGs.

## Recovery

Migration 0010 is additive. Application rollback leaves the table and requests in place; do not drop user requests as an application rollback. Recover database data from an encrypted backup/PITR if a data incident occurs. The production recovery drill remains a separate P0 gate.
