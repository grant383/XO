import { randomUUID } from "node:crypto";
import { getCommandCentre, dueLabel, relativeTime } from "@/modules/command";
import { AddTaskForm, TaskToggle } from "./task-controls";
import { createTaskAction, setTaskStatusAction } from "./actions";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  can,
  resolveSelectedVenture,
  VentureNotFoundError,
  VentureStateError,
  type VentureAccess,
} from "@/modules/ventures";
import { cx } from "@/ui/cx";
import { ForbiddenState } from "../../../../_chrome/error-states";
import { PageContent } from "../../../../_shell/page-header";
import { requireActor } from "../../../../actor";
import { NoVentureAccess } from "../../no-access";
import styles from "./command.module.css";
import { COMMAND_FIXTURE as data, type FixtureChange, type FixtureInsight } from "./fixture";

export const metadata: Metadata = { title: "Command Centre" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ ventureId: string }> };

const PRIORITY_LABEL = { high: "High", medium: "Medium", low: "Low" } as const;

/**
 * Command Centre (Figma 8:651; spec §8 Viewer+). Four quadrants: today's numbers, what
 * changed, why and what to do, rendered from a deterministic local fixture. The venture
 * comes from the route and is re-authorised here; the shell layout did the same.
 */
export default async function CommandCentrePage({ params }: Props) {
  const { ventureId } = await params;
  const actor = await requireActor(`/v/${ventureId}/command`);
  let access: VentureAccess;
  try {
    access = await resolveSelectedVenture(actor, ventureId);
  } catch (error) {
    if (error instanceof VentureNotFoundError) return <NoVentureAccess ventureId={ventureId} />;
    if (error instanceof VentureStateError) redirect("/");
    throw error;
  }
  if (!can(access.role, "command:view")) {
    return (
      <PageContent>
        <ForbiddenState as="h1" required="Viewer" />
      </PageContent>
    );
  }

  const snapshot = await getCommandCentre(actor, ventureId);
  const tasks = [...snapshot.openTasks, ...snapshot.completedTasks];
  const displayedTasks: {
    id?: string;
    status?: "open" | "done";
    title: string;
    priority: keyof typeof PRIORITY_LABEL;
    due: string;
  }[] = tasks.length
    ? tasks.map((t) => ({ ...t, due: dueLabel(t.dueOn, snapshot.today).label }))
    : data.tasks;
  const changes: FixtureChange[] = snapshot.changes.length
    ? snapshot.changes.map((c) => ({
        when: relativeTime(c.at, snapshot.asOf, snapshot.venture.timezone),
        text: `${c.kind === "task_added" ? "Task added" : c.kind === "task_completed" ? "Task completed" : "Task reopened"}: ${c.title}`,
        tone: c.kind === "task_completed" ? "success" : "info",
      }))
    : data.changes;
  const taskSignals = snapshot.signals.filter((s) => s.ruleId.startsWith("command.tasks."));
  const insights: FixtureInsight[] = taskSignals.length
    ? taskSignals.map((s) => ({
        title: s.title,
        body: `${s.detail} ${s.action}`,
        tone: s.severity,
        meta: `Rule ${s.ruleId} v${s.ruleVersion}`,
      }))
    : data.insights;
  const taskAction = setTaskStatusAction.bind(null, ventureId);
  return (
    <div className={styles.content}>
      <h1 className="visually-hidden">Command Centre</h1>
      <div className={styles.grid}>
        <section className={styles.quadrant} aria-labelledby="command-numbers">
          <h2 id="command-numbers" className={styles.eyebrow}>
            Today’s numbers
          </h2>
          <dl className={styles.tiles}>
            {data.metrics.map((m) => (
              <div key={m.label} className={styles.tile}>
                <dt className={styles.tileLabel}>{m.label}</dt>
                <dd className={styles.tileRow}>
                  <span className={styles.tileValue}>{m.value}</span>
                  <span className={cx(styles.tileChange, styles[m.tone])}>{m.change}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={styles.quadrant} aria-labelledby="command-changes">
          <h2 id="command-changes" className={styles.eyebrow}>
            What changed
          </h2>
          <ol className={cx(styles.card, styles.timeline)}>
            {changes.map((c) => (
              <li key={c.text} className={styles.timelineRow}>
                <span className={styles.timelineTime}>{c.when}</span>
                <img
                  className={styles.dot}
                  src={`/ui/command/${c.tone}.svg`}
                  width="6"
                  height="6"
                  alt=""
                />
                <p className={styles.timelineText}>{c.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.quadrant} aria-labelledby="command-why">
          <h2 id="command-why" className={styles.eyebrow}>
            Why
          </h2>
          <div className={styles.insights}>
            {insights.map((i) => (
              <article key={i.title} className={cx(styles.insight, styles[i.tone])}>
                <div className={styles.insightCopy}>
                  <h3 className={styles.insightTitle}>{i.title}</h3>
                  <p className={styles.insightText}>{i.body}</p>
                </div>
                <p className={styles.insightMeta}>{i.meta}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.quadrant} aria-labelledby="command-todo">
          <h2 id="command-todo" className={styles.eyebrow}>
            What to do
            {tasks.length ? <span className={styles.taskSource}> · Venture tasks</span> : null}
          </h2>
          <ul className={cx(styles.card, styles.tasks)} aria-label="Open tasks">
            {displayedTasks.map((t) => (
              <li key={t.id ?? t.title} className={styles.taskRow} data-status={t.status}>
                {t.id ? (
                  snapshot.viewer.canManageTasks ? (
                    <TaskToggle
                      action={taskAction}
                      taskId={t.id}
                      title={t.title}
                      done={t.status === "done"}
                    />
                  ) : (
                    <span className={styles.checkbox} aria-hidden="true" />
                  )
                ) : (
                  <span className={styles.checkbox} aria-hidden="true" title="Sample task" />
                )}
                <p className={styles.taskTitle}>{t.title}</p>
                <span className={cx(styles.priority, styles[t.priority])}>
                  <span className="visually-hidden">Priority: </span>
                  {PRIORITY_LABEL[t.priority]}
                </span>
                <span className={styles.due}>{t.due}</span>
              </li>
            ))}
          </ul>
          {snapshot.viewer.canManageTasks ? (
            <details className={styles.manageTasks}>
              <summary>Manage venture tasks</summary>
              <AddTaskForm
                action={createTaskAction.bind(null, ventureId)}
                requestId={randomUUID()}
              />
            </details>
          ) : null}
        </section>
      </div>
    </div>
  );
}
