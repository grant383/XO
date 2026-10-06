import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { listSupportRequests } from "@/modules/support";
import { supportCursor } from "@/modules/support";
import { Button, ButtonLink, EmptyState, StatusBadge, TextField } from "@/ui";
import { requireActor } from "../actor";
import { PageContent, PageHeader } from "../_shell/page-header";
import { articles } from "./articles";
import { SupportForm } from "./form";
import styles from "./support.module.css";

export const metadata: Metadata = { title: "Help and support" };
export const dynamic = "force-dynamic";
export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; new?: string; at?: string; id?: string }>;
}) {
  const actor = await requireActor("/support");
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 200) : "";
  const cursor = supportCursor.safeParse({ at: params.at, id: params.id });
  const requests = await listSupportRequests(actor, cursor.success ? cursor.data : undefined);
  const topics = articles.filter((a) =>
    `${a.title} ${a.summary} ${a.body}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Account" }, { label: "Help & Support" }]}
        title="Help & Support"
      >
        Guidance, documentation, and direct support for DirectorXO
      </PageHeader>
      <PageContent>
        <form action="/support" className={styles.search}>
          <div className={styles.searchField}>
            <img className={styles.searchIcon} src="/ui/support/search.svg" alt="" />
            <TextField
              name="q"
              label="Search help articles"
              defaultValue={query}
              maxLength={200}
              placeholder="Search help articles, workflows, and product documentation"
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        <div className={styles.columns}>
          <div className={styles.stack}>
            <section aria-labelledby="topics">
              <h2 id="topics" className={styles.eyebrow}>
                Common topics
              </h2>
              <div className={styles.topics}>
                {topics.map((a) => (
                  <details key={a.id} className={styles.card}>
                    <summary>
                      <span className={styles.topicIcon}>
                        <img src={`/ui/support/${a.icon}.svg`} alt="" />
                      </span>
                      <strong>{a.title}</strong>
                      <span>{a.summary}</span>
                    </summary>
                    <p>{a.body}</p>
                  </details>
                ))}
              </div>
              {!topics.length ? (
                <EmptyState title="No matching articles" description="Try another search term." />
              ) : null}
            </section>
            <section className={styles.card} aria-labelledby="documentation">
              <h2 id="documentation">Documentation</h2>
              <p>Product guidance for owners and administrators.</p>
              <div className={styles.docs}>
                <Link href="/onboarding">Start venture setup</Link>
                <Link href="/settings/profile-security">Security centre</Link>
                <Link href="/">Your ventures</Link>
              </div>
            </section>
            <section className={styles.card} aria-labelledby="requests">
              <h2 id="requests">Recent support requests</h2>
              <p>Requests submitted from your account.</p>
              {requests.items.length ? (
                <ul className={styles.requests}>
                  {requests.items.map((r) => (
                    <li key={r.id}>
                      <details>
                        <summary>{r.subject}</summary>
                        <p className={styles.description}>{r.description}</p>
                      </details>
                      <StatusBadge tone={r.status === "resolved" ? "success" : "info"}>
                        {r.status}
                      </StatusBadge>
                      <time dateTime={r.createdAt.toISOString()}>
                        {r.createdAt.toLocaleDateString("en-GB", { timeZone: "UTC" })}
                      </time>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="No support requests yet"
                  description="Create a request when you need help."
                />
              )}
              {requests.nextCursor ? (
                <ButtonLink
                  variant="secondary"
                  href={`/support?at=${encodeURIComponent(requests.nextCursor.at)}&id=${requests.nextCursor.id}`}
                >
                  Older requests
                </ButtonLink>
              ) : null}
            </section>
          </div>
          <aside className={styles.stack} aria-label="Contact support">
            <section className={styles.card}>
              <span className={styles.contactIcon}>
                <img src="/ui/support/messagecircle.svg" alt="" />
              </span>
              <h2>Contact support</h2>
              <p>Submit a request and track it from your account.</p>
              <ButtonLink href="/support?new=1#new-request" block>
                Create support request
              </ButtonLink>
            </section>
            <section className={styles.card}>
              <h2>System status</h2>
              <p>Check the current application readiness status.</p>
              <Link href="/api/health/ready">View system status</Link>
            </section>
          </aside>
        </div>
        {params.new === "1" ? (
          <section id="new-request" className={styles.card}>
            <SupportForm requestId={randomUUID()} />
          </section>
        ) : null}
      </PageContent>
    </>
  );
}
