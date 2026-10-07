import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  clockTime,
  dueLabel,
  formatChange,
  formatMetricValue,
  getCommandCentre,
  longDate,
  relativeTime,
  type CommandCentre,
  type CommandChange,
  type CommandMetric,
  type CommandSignal,
  type CommandTask,
} from "@/modules/command";
import {
  ROLE_LABELS,
  VentureNotFoundError,
  VenturePermissionError,
  VentureStateError,
} from "@/modules/ventures";
import { EmptyState } from "@/ui";
import { cx } from "@/ui/cx";
import { ForbiddenState } from "../../../../_chrome/error-states";
import { PageContent, PageHeader } from "../../../../_shell/page-header";
import { requireActor } from "../../../../actor";
import { NoVentureAccess } from "../../no-access";
import { createTaskAction, setTaskStatusAction } from "./actions";
import styles from "./command.module.css";
import { AddTaskForm, Freshness, TaskToggle } from "./tasks";

export const metadata: Metadata = { title: "Command Centre" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ ventureId: string }> };

const PRIORITY_LABEL = { high: "High", medium: "Medium", low: "Low" } as const;
const SEVERITY_LABEL = { danger: "Action needed", warning: "Attention", info: "Information" };
const CHANGE_VERB = {
  task_added: "added",
  task_completed: "completed",
  task_reopened: "reopened",
} as const;

function MetricTile({ metric }: { metric: CommandMetric }) {
  if (metric.status === "available") {
    const change = metric.change === null ? null : formatChange(metric.change);
    return (
      <div className={styles.tile}>
        <dt className={styles.tileLabel}>{metric.label}</dt>
        <dd className={styles.tileValue}>
          {formatMetricValue(metric.unit, metric.value, metric.currency)}
        </dd>
        {change ? (
          <dd className={cx(styles.tileMeta, styles[change.direction])}>{change.text}</dd>
        ) : null}
      </div>
    );
  }
  return (
    <div className={styles.tile}>
      <dt className={styles.tileLabel}>{metric.label}</dt>
      <dd className={styles.tileValue}>
        <span aria-hidden="true">—</span>
        <span className="visually-hidden">No figure yet.</span>
      </dd>
      <dd className={styles.tileMeta}>Source: {metric.source}</dd>
    </div>
  );
}

function Changes({ data }: { data: CommandCentre }) {
  if (data.changes.length === 0) {
    return (
      <EmptyState
        as="h3"
        icon="inbox"
        title="Nothing has changed yet"
        description="Task activity appears here, newest first. Finance, operations and growth events join it as those modules connect."
        className={styles.cardEmpty}
      />
    );
  }
  return (
    <ol className={styles.timeline}>
      {data.changes.map((c: CommandChange) => (
        <li key={c.id} className={styles.timelineRow}>
          <time
            dateTime={c.at.toISOString()}
            title={`${longDate(c.at, data.venture.timezone)} ${clockTime(c.at, data.venture.timezone)}`}
            className={styles.timelineTime}
          >
            {relativeTime(c.at, data.asOf, data.venture.timezone)}
          </time>
          <span className={cx(styles.dot, styles[c.kind])} aria-hidden="true" />
          <p className={styles.timelineText}>
            {c.actorName ?? "A former member"} {CHANGE_VERB[c.kind]} “{c.title}”
          </p>
        </li>
      ))}
    </ol>
  );
}

function Signal({ signal, data }: { signal: CommandSignal; data: CommandCentre }) {
  return (
    <article className={cx(styles.signal, styles[signal.severity])}>
      <div className={styles.signalCopy}>
        <h3 className={styles.signalTitle}>{signal.title}</h3>
        <p className={styles.signalText}>{signal.detail}</p>
        <p className={styles.signalText}>
          <strong>Recommended:</strong> {signal.action}
        </p>
      </div>
      <details className={styles.evidence}>
        <summary>Evidence and threshold</summary>
        <dl>
          {signal.evidence.map((e) => (
            <div key={e.label}>
              <dt>{e.label}</dt>
              <dd>{e.value}</dd>
            </div>
          ))}
          <div>
            <dt>Threshold</dt>
            <dd>{signal.threshold}</dd>
          </div>
        </dl>
      </details>
      <p className={styles.signalMeta}>
        {SEVERITY_LABEL[signal.severity]} · Rule {signal.ruleId} v{signal.ruleVersion} · Evaluated{" "}
        {clockTime(signal.evaluatedAt, data.venture.timezone)}
      </p>
    </article>
  );
}

function TaskRow({
  task,
  data,
  ventureId,
}: {
  task: CommandTask;
  data: CommandCentre;
  ventureId: string;
}) {
  const done = task.status === "done";
  const due = dueLabel(task.dueOn, data.today);
  return (
    <li className={cx(styles.taskRow, done && styles.taskDone)}>
      {data.viewer.canManageTasks ? (
        <TaskToggle
          action={setTaskStatusAction.bind(null, ventureId)}
          taskId={task.id}
          title={task.title}
          done={done}
        />
      ) : (
        <span className={styles.checkboxStatic} aria-hidden="true" />
      )}
      <p className={styles.taskTitle}>
        {task.title}
        {done ? <span className="visually-hidden"> (done)</span> : null}
      </p>
      <span className={cx(styles.priority, styles[task.priority])}>
        <span className="visually-hidden">Priority: </span>
        {PRIORITY_LABEL[task.priority]}
      </span>
      <span className={cx(styles.due, !done && due.overdue && styles.overdue)}>
        {done ? "Done" : due.label}
      </span>
    </li>
  );
}

/**
 * Command Centre (Figma 8:651; spec §8 Viewer+). Four quadrants: today's numbers, what
 * changed, why (deterministic rule signals) and what to do (tasks). The venture comes from
 * the route and is re-authorised on every request; the shell layout already did the same.
 */
export default async function CommandCentrePage({ params }: Props) {
  const { ventureId } = await params;
  const actor = await requireActor(`/v/${ventureId}/command`);
  let data: CommandCentre;
  try {
    data = await getCommandCentre(actor, ventureId);
  } catch (error) {
    if (error instanceof VentureNotFoundError) return <NoVentureAccess ventureId={ventureId} />;
    if (error instanceof VenturePermissionError) {
      return (
        <PageContent>
          <ForbiddenState as="h1" required="Viewer" />
        </PageContent>
      );
    }
    if (error instanceof VentureStateError) redirect("/");
    throw error;
  }

  const tz = data.venture.timezone;
  const awaiting = data.metrics.filter((m) => m.status === "awaiting_source").length;
  return (
    <>
      <PageHeader
        crumbs={[{ label: data.venture.name }, { label: "Command" }, { label: "Command Centre" }]}
        title="Command Centre"
        actions={
          <div className={styles.headerMeta}>
            <p>{longDate(data.asOf, tz)}</p>
            <Freshness asOf={clockTime(data.asOf, tz)} />
          </div>
        }
      >
        Business health, exceptions and tasks. Your role: {ROLE_LABELS[data.viewer.role]}.
      </PageHeader>
      <PageContent>
        <div className={styles.grid}>
          <section className={styles.quadrant} aria-labelledby="command-numbers">
            <h2 id="command-numbers" className={styles.eyebrow}>
              Today’s numbers
            </h2>
            {awaiting > 0 ? (
              <p className={styles.note}>
                No figures are shown until their source records are connected. Nothing here is
                sample data.
              </p>
            ) : null}
            <dl className={styles.tiles}>
              {data.metrics.map((m) => (
                <MetricTile key={m.key} metric={m} />
              ))}
            </dl>
          </section>

          <section className={styles.quadrant} aria-labelledby="command-changes">
            <h2 id="command-changes" className={styles.eyebrow}>
              What changed
            </h2>
            <div className={styles.card}>
              <Changes data={data} />
            </div>
          </section>

          <section className={styles.quadrant} aria-labelledby="command-why">
            <h2 id="command-why" className={styles.eyebrow}>
              Why
            </h2>
            {data.signals.length === 0 ? (
              <div className={styles.card}>
                <EmptyState
                  as="h3"
                  icon="circle-check"
                  title="No rule has flagged anything"
                  description="Signals appear here when a rule’s threshold is crossed, with the evidence behind them."
                  className={styles.cardEmpty}
                />
              </div>
            ) : (
              <div className={styles.signals}>
                {data.signals.map((s) => (
                  <Signal key={s.ruleId} signal={s} data={data} />
                ))}
              </div>
            )}
          </section>

          <section className={styles.quadrant} aria-labelledby="command-todo">
            <h2 id="command-todo" className={styles.eyebrow}>
              What to do
            </h2>
            <div className={styles.card}>
              {data.openTasks.length === 0 ? (
                <EmptyState
                  as="h3"
                  icon="circle-check"
                  title="No open tasks"
                  description={
                    data.viewer.canManageTasks
                      ? "Add the next actions for this venture below."
                      : "When the team adds tasks, they appear here."
                  }
                  className={styles.cardEmpty}
                />
              ) : (
                <ul className={styles.tasks} aria-label="Open tasks">
                  {data.openTasks.map((t) => (
                    <TaskRow key={t.id} task={t} data={data} ventureId={ventureId} />
                  ))}
                </ul>
              )}
              {data.completedTasks.length > 0 ? (
                <>
                  <h3 className={styles.subheading}>Completed in the last 7 days</h3>
                  <ul className={styles.tasks} aria-label="Completed tasks">
                    {data.completedTasks.map((t) => (
                      <TaskRow key={t.id} task={t} data={data} ventureId={ventureId} />
                    ))}
                  </ul>
                </>
              ) : null}
              {data.viewer.canManageTasks ? (
                <AddTaskForm
                  action={createTaskAction.bind(null, ventureId)}
                  requestId={randomUUID()}
                />
              ) : (
                <p className={styles.note}>
                  Your role can view tasks. Operators, Managers, Admins and the Owner add and
                  complete them.
                </p>
              )}
            </div>
          </section>
        </div>
      </PageContent>
    </>
  );
}
