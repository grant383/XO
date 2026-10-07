# ADR-0024 — Command Centre (first P1 slice)

- Status: Accepted
- Date: 2026-10-07

## Context

Command Centre (`/v/[ventureId]/command`, Figma 8:651, spec §8 Viewer+) is the first P1 product slice. The Command/Build matrix (Figma 50:10242) lists its principal data as "health signals, exceptions, tasks" in the `command` domain. The Figma frame shows four quadrants: Today's numbers (six metric tiles), What changed, Why ("AI Analysis" cards) and What to do (tasks with priority and due date).

The metric tiles (revenue, jobs, pipeline, average job value, cash) depend on operational records owned by Operate Finance, Operations and Growth. None of those modules exist yet. P0 infrastructure is frozen: only backend work this screen needs directly is allowed.

## Decision

1. **Tasks are the only new data.** `command_tasks` (migration 0013) is venture-owned, with `venture_id NOT NULL`, a client request UUID for idempotency, a title (1–200 characters), a priority (high/medium/low), an optional due date in the venture calendar, an open/done status and the last status change (when and by whom). FORCE RLS (migration 0014) lets every active member of the venture in context read tasks. Only Operator+ may insert or update, and only as themselves. The runtime role may update the status columns only and cannot delete. New RBAC capabilities `command:view` (Viewer+) and `command:manage_tasks` (Operator+) mirror the policies. Creation, completion and reopening are audited atomically (`command.task.*`); the metadata never includes the title.
2. **No sample or placeholder figures.** Each of the six Figma tiles is a typed metric that names the source module expected to drive it. Until that module ships, the metric reports `awaiting_source` and the tile shows "—" with its source. We do not create finance, job or pipeline tables in this slice: they belong to the Operate slices that own those records (spec §19 P1 exit: operational records drive Command metrics). When a source ships, its metric becomes `available` with value (integer minor units for money), change, currency and `asOf`.
3. **"Why" is deterministic.** Release 1 forbids AI forecasting/analysis (spec §3, §13.14), so the Figma "AI Analysis" cards are rule outputs. Each signal carries a rule id and version, severity, the triggering evidence, the threshold, a recommended action and its evaluation time, and the UI shows all of them. Rules in this slice: `command.tasks.overdue@1`, `command.tasks.high_priority_due_today@1`, `command.metrics.awaiting_sources@1`. Signals are evaluated on read and are not persisted. The persisted recommendation workflow (status, reviewer decision, dismissal reason) is P2 Intelligence.
4. **"What changed" is derived from tasks.** The venture audit log is readable only by Owner/Admin (ADR-0018), and Command is Viewer+. The feed is therefore derived from `command_tasks` (each task's creation and its latest completion or reopening), which every member may read. Removed members appear as "A former member". Operate modules will add their own events when they ship.
5. **Venture calendar.** "Today", due labels, overdue rules and timestamps use `ventures.timezone`, never the server's or browser's timezone.
6. **Routing.** `/v/[ventureId]` redirects to Command Centre, the canonical venture landing page. The sign-in entry point, the venture switcher, onboarding completion and invitation acceptance link straight to it. The legacy `/dashboard` (Figma 3:255) redirects to the first accessible active venture's Command Centre. Signed-out users go to sign-in, and users with no venture go to onboarding. It uses a temporary 307 redirect, not the "permanent" one in the Figma matrix, because the target depends on the signed-in account and must not be cached across accounts. The shell navigation gains a Command section (Command Centre).
7. **APIs.** `GET /api/v1/command?ventureId=` (OpenAPI) returns the snapshot through the same module, with the account API boundary's rate limit, correlation id and identical 403 for unknown or inaccessible ventures. Task changes are Server Actions (inventoried in `server-actions.json`).
8. **States.** The shell loading boundary (Figma 54:27792) and error boundary (31:3692) apply. Non-members get the existing no-access state with request access. Empty states cover tasks, changes and signals. Viewers see tasks without controls and with an explanation. The Figma "Live" indicator becomes an honest freshness indicator ("Updated HH:MM"). Offline, the page says it is showing data from that time, and task changes are disabled (spec §11: P1 offline is read-only).

## Consequences

- Design-sync items: the "AI Analysis" label becomes "Rule … v1"; "Live" becomes "Updated HH:MM"; the "Customer sat" tile has no source in spec §16; the legacy redirect is 307, not permanent. The Figma sidebar is the pre-shell layout; the approved app shell (54:24284–54:24286) governs.
- Performance: one tenant transaction with four indexed queries (`command_tasks_venture_status_idx`); open tasks are capped at 50, completed at 5 and changes at 8.

## Recovery

Migrations 0013–0014 are additive. Rolling back the application leaves the table and tasks in place; do not drop tasks as an application rollback. Recover data from backup/PITR if a data incident occurs.
