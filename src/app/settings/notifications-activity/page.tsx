import type { Metadata } from "next";
import {
  getInbox,
  getVentureActivity,
  eventLabel,
  ventureEventLabel,
  inboxQuery,
} from "@/modules/notifications";
import {
  listSwitchableVentures,
  VentureNotFoundError,
  VenturePermissionError,
  VentureStateError,
} from "@/modules/ventures";
import { Button, ButtonLink, EmptyState, SelectField, StatusBadge } from "@/ui";
import { requireActor } from "../../actor";
import { PageContent, PageHeader } from "../../_shell/page-header";
import { ForbiddenState } from "../../_chrome/error-states";
import { ReadButton } from "./read-button";
import styles from "./notifications.module.css";
export const metadata: Metadata = { title: "Notifications and activity" };
export const dynamic = "force-dynamic";
const PATH = "/settings/notifications-activity";
const timestamp = (date: Date) => date.toLocaleString("en-GB", { timeZone: "UTC" });
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ unread?: string; ventureId?: string; at?: string; id?: string }>;
}) {
  const actor = await requireActor(PATH);
  const params = await searchParams;
  const unread = params.unread === "1";
  const parsedQuery = inboxQuery.safeParse({
    unread,
    ...(params.at && params.id ? { cursor: { at: params.at, id: params.id } } : {}),
  });
  const [inbox, ventures] = await Promise.all([
    getInbox(actor, parsedQuery.success ? parsedQuery.data : { unread }),
    listSwitchableVentures(actor),
  ]);
  let activity: Awaited<ReturnType<typeof getVentureActivity>> = [];
  if (params.ventureId) {
    try {
      activity = await getVentureActivity(actor, params.ventureId);
    } catch (e) {
      if (
        e instanceof VentureNotFoundError ||
        e instanceof VenturePermissionError ||
        e instanceof VentureStateError
      )
        return (
          <ForbiddenState
            title="Permission required"
            description="You cannot view this venture’s activity."
          />
        );
      throw e;
    }
  }
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Account" }, { label: "Notifications & Activity" }]}
        title="Notifications & Activity"
        actions={<ReadButton through={inbox.asOf} disabled={inbox.unread === 0} />}
      >
        Account alerts, security updates, and permitted team activity in one feed
      </PageHeader>
      <PageContent>
        <nav className={styles.filters} aria-label="Notification filters">
          <ButtonLink href={PATH} variant={unread ? "secondary" : "primary"}>
            All ({inbox.total})
          </ButtonLink>
          <ButtonLink href={`${PATH}?unread=1`} variant={unread ? "primary" : "secondary"}>
            Unread ({inbox.unread})
          </ButtonLink>
        </nav>
        <div className={styles.columns}>
          <section className={styles.feed} aria-label="Account notifications">
            {inbox.items.length ? (
              <ul>
                {inbox.items.map((n) => (
                  <li key={n.id} data-unread={!n.readAt}>
                    <span className={styles.icon}>
                      <img
                        src={`/ui/notifications/${n.action.includes("failed") ? "alert" : "activity"}.svg`}
                        alt=""
                      />
                    </span>
                    <div className={styles.copy}>
                      <div className={styles.meta}>
                        <span>Account activity</span>
                        {!n.readAt ? <StatusBadge tone="info">Unread</StatusBadge> : null}
                      </div>
                      <h2>{eventLabel(n.action)}</h2>
                      <p>This event was recorded for your account.</p>
                      {!n.readAt ? <ReadButton id={n.id} through={inbox.asOf} /> : null}
                    </div>
                    <time dateTime={n.createdAt.toISOString()}>{timestamp(n.createdAt)} UTC</time>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title={unread ? "You’re all caught up" : "No notifications yet"}
                description="Account activity will appear here as it happens."
              />
            )}
            {inbox.nextCursor ? (
              <ButtonLink
                variant="secondary"
                href={`${PATH}?unread=${unread ? "1" : "0"}&at=${encodeURIComponent(inbox.nextCursor.at)}&id=${inbox.nextCursor.id}`}
              >
                Older notifications
              </ButtonLink>
            ) : null}
          </section>
          <aside className={styles.stack} aria-label="Activity summary">
            <section className={styles.card}>
              <h2>This week</h2>
              <dl>
                <dt>Account events</dt>
                <dd>{inbox.thisWeek}</dd>
                <dt>Unread notifications</dt>
                <dd>{inbox.unread}</dd>
              </dl>
            </section>
            <section className={styles.card}>
              <h2>Email notifications</h2>
              <p>
                Verification, recovery and invitation emails are sent separately. Scheduled digests
                are not available yet.
              </p>
              <ButtonLink href="/settings/profile-security" variant="secondary">
                Security settings
              </ButtonLink>
            </section>
          </aside>
        </div>
        <section className={styles.card}>
          <h2>Venture activity</h2>
          <p>Owners and Admins can view the audit activity of their active ventures.</p>
          <form action={PATH} className={styles.selection}>
            <SelectField
              name="ventureId"
              label="Venture"
              placeholder="Choose a venture"
              defaultValue={params.ventureId ?? ""}
              options={ventures
                .filter((v) => v.role === "owner" || v.role === "admin")
                .map((v) => ({ value: v.id, label: v.name }))}
            />
            <Button type="submit" variant="secondary">
              View activity
            </Button>
          </form>
          {params.ventureId ? (
            activity.length ? (
              <ul className={styles.activity}>
                {activity.map((e) => (
                  <li key={e.id}>
                    <span>{ventureEventLabel(e.action)}</span>
                    <StatusBadge tone={e.outcome === "success" ? "success" : "warning"}>
                      {e.outcome}
                    </StatusBadge>
                    <time dateTime={e.occurredAt.toISOString()}>{timestamp(e.occurredAt)} UTC</time>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No venture activity yet" />
            )
          ) : null}
        </section>
      </PageContent>
    </>
  );
}
