import { aliasedTable, and, asc, desc, eq, gt, isNotNull, ne, sql } from "drizzle-orm";
import { pgCode, schema, withTenant, type Tx } from "@/platform/db";
import { redis } from "@/platform/redis";
import { RedisRateLimitStore } from "@/platform/security";
import {
  can,
  resolveSelectedVenture,
  rolesWith,
  VentureNotFoundError,
  VenturePermissionError,
  type Actor,
  type VentureAccess,
  type VentureRole,
} from "@/modules/ventures";
import { localDate } from "./calendar";
import { commandMetrics, type CommandMetric } from "./metrics";
import {
  CommandEvents,
  createTaskInput,
  taskStatusInput,
  type TaskPriority,
  type TaskStatus,
} from "./policy";
import { evaluateSignals, type CommandSignal } from "./signals";

/**
 * Command module (spec §4 Command; Figma 8:651; matrix row 16): the venture's business
 * health, exceptions and tasks. Every read and write resolves the venture and capability
 * from the database on each call; PostgreSQL RLS independently confines rows to the venture
 * in context and task writes to Operator+ (migration 0014).
 */

const { auditLog, commandTasks, users, ventures } = schema;

export type CommandTask = {
  id: string;
  title: string;
  priority: TaskPriority;
  /** YYYY-MM-DD in the venture timezone. */
  dueOn: string | null;
  status: TaskStatus;
  createdAt: Date;
  statusChangedAt: Date | null;
};

export type CommandChange = {
  id: string;
  kind: "task_added" | "task_completed" | "task_reopened";
  at: Date;
  title: string;
  /** Null when the person is no longer visible to the viewer (e.g. removed member). */
  actorName: string | null;
};

export type CommandCentre = {
  venture: { id: string; name: string; timezone: string; reportingCurrency: string };
  viewer: { role: VentureRole; canManageTasks: boolean };
  /** When this snapshot was read (freshness indicator, spec §20). */
  asOf: Date;
  /** YYYY-MM-DD in the venture timezone. */
  today: string;
  metrics: CommandMetric[];
  signals: CommandSignal[];
  changes: CommandChange[];
  openTasks: CommandTask[];
  /** Completed in the last seven days, newest first. */
  completedTasks: CommandTask[];
};

export type CommandErrorCode = "VALIDATION" | "NOT_FOUND" | "CONFLICT" | "LIMIT";
export type CommandResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: CommandErrorCode; message: string; fieldErrors?: Record<string, string> };

const fail = (
  code: CommandErrorCode,
  message: string,
  fieldErrors?: Record<string, string>,
): CommandResult<never> => ({ ok: false, code, message, ...(fieldErrors ? { fieldErrors } : {}) });

const tenant = (access: VentureAccess) => ({
  userId: access.userId,
  ventureId: access.id,
  correlationId: access.correlationId,
});

const OPEN_LIMIT = 50;
const COMPLETED_LIMIT = 5;
const CHANGES_LIMIT = 8;

const taskColumns = {
  id: commandTasks.id,
  title: commandTasks.title,
  priority: commandTasks.priority,
  dueOn: commandTasks.dueOn,
  status: commandTasks.status,
  createdAt: commandTasks.createdAt,
  statusChangedAt: commandTasks.statusChangedAt,
};

async function recentChanges(tx: Tx, ventureId: string): Promise<CommandChange[]> {
  // users RLS shows only co-members, so a removed member's name resolves to null.
  const creator = aliasedTable(users, "creator");
  const changer = aliasedTable(users, "changer");
  const [added, changed] = await Promise.all([
    tx
      .select({
        id: commandTasks.id,
        title: commandTasks.title,
        at: commandTasks.createdAt,
        actorName: creator.name,
      })
      .from(commandTasks)
      .leftJoin(creator, eq(creator.id, commandTasks.createdBy))
      .where(eq(commandTasks.ventureId, ventureId))
      .orderBy(desc(commandTasks.createdAt), desc(commandTasks.id))
      .limit(CHANGES_LIMIT),
    tx
      .select({
        id: commandTasks.id,
        title: commandTasks.title,
        at: commandTasks.statusChangedAt,
        status: commandTasks.status,
        actorName: changer.name,
      })
      .from(commandTasks)
      .leftJoin(changer, eq(changer.id, commandTasks.statusChangedBy))
      .where(and(eq(commandTasks.ventureId, ventureId), isNotNull(commandTasks.statusChangedAt)))
      .orderBy(desc(commandTasks.statusChangedAt), desc(commandTasks.id))
      .limit(CHANGES_LIMIT),
  ]);
  return [
    ...added.map((r) => ({ ...r, id: `${r.id}:added`, kind: "task_added" as const })),
    ...changed.map((r) => ({
      id: `${r.id}:status`,
      title: r.title,
      at: r.at!,
      actorName: r.actorName,
      kind: r.status === "done" ? ("task_completed" as const) : ("task_reopened" as const),
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime() || b.id.localeCompare(a.id))
    .slice(0, CHANGES_LIMIT);
}

/** Command Centre read model (spec §8: Viewer+). */
export async function getCommandCentre(
  actor: Actor,
  ventureId: string,
  now: Date = new Date(),
): Promise<CommandCentre> {
  const access = await resolveSelectedVenture(actor, ventureId, "command:view");
  return withTenant(tenant(access), async (tx) => {
    const [venture] = await tx
      .select({
        timezone: ventures.timezone,
        reportingCurrency: ventures.reportingCurrency,
      })
      .from(ventures)
      .where(eq(ventures.id, access.id));
    if (!venture) throw new VentureNotFoundError();

    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const [openTasks, completedTasks, changes] = await Promise.all([
      tx
        .select(taskColumns)
        .from(commandTasks)
        .where(and(eq(commandTasks.ventureId, access.id), eq(commandTasks.status, "open")))
        // Enum order is high, medium, low.
        .orderBy(
          asc(commandTasks.priority),
          sql`${commandTasks.dueOn} asc nulls last`,
          asc(commandTasks.createdAt),
          asc(commandTasks.id),
        )
        .limit(OPEN_LIMIT),
      tx
        .select(taskColumns)
        .from(commandTasks)
        .where(
          and(
            eq(commandTasks.ventureId, access.id),
            eq(commandTasks.status, "done"),
            gt(commandTasks.statusChangedAt, weekAgo),
          ),
        )
        .orderBy(desc(commandTasks.statusChangedAt), desc(commandTasks.id))
        .limit(COMPLETED_LIMIT),
      recentChanges(tx, access.id),
    ]);

    const today = localDate(now, venture.timezone);
    const metrics = commandMetrics();
    return {
      venture: { id: access.id, name: access.name, ...venture },
      viewer: { role: access.role, canManageTasks: can(access.role, "command:manage_tasks") },
      asOf: now,
      today,
      metrics,
      signals: evaluateSignals({ today, openTasks, metrics }, now),
      changes,
      openTasks,
      completedTasks,
    };
  });
}

/** RLS rejects the write when the role changed after the request-level check. */
function rethrowRls(error: unknown): never {
  if (pgCode(error) === "42501")
    throw new VenturePermissionError(rolesWith("command:manage_tasks"));
  throw error;
}

async function recordCommandEvent(
  tx: Tx,
  access: VentureAccess,
  action: string,
  taskId: string,
  metadata: Record<string, unknown> = {},
) {
  await tx.insert(auditLog).values({
    ventureId: access.id,
    actorType: "user",
    actorUserId: access.userId,
    action,
    targetType: "command_task",
    targetId: taskId,
    metadata,
    correlationId: access.correlationId ?? null,
  });
}

/**
 * Adds a task (Operator+). Retry-safe: the same `requestId` with the same content returns
 * the original task; different content is a conflict. Creation and audit are atomic.
 */
export async function createTask(
  actor: Actor,
  ventureId: string,
  input: unknown,
): Promise<CommandResult<CommandTask>> {
  const access = await resolveSelectedVenture(actor, ventureId, "command:manage_tasks");
  const parsed = createTaskInput.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return fail("VALIDATION", "Check the task details.", fieldErrors);
  }
  const limit = await new RedisRateLimitStore(redis()).consume(
    `command:task:${access.id}:${access.userId}`,
    { windowSec: 3600, max: 200 },
  );
  if (!limit.allowed) return fail("LIMIT", "Too many tasks added. Please try again later.");

  const task = parsed.data;
  try {
    return await withTenant(tenant(access), async (tx) => {
      const [created] = await tx
        .insert(commandTasks)
        .values({
          ventureId: access.id,
          requestId: task.requestId,
          title: task.title,
          priority: task.priority,
          dueOn: task.dueOn,
          createdBy: access.userId,
        })
        .onConflictDoNothing()
        .returning(taskColumns);
      if (created) {
        await recordCommandEvent(tx, access, CommandEvents.taskCreated, created.id, {
          priority: created.priority,
          hasDueDate: created.dueOn !== null,
        });
        return { ok: true as const, data: created };
      }
      const [existing] = await tx
        .select(taskColumns)
        .from(commandTasks)
        .where(
          and(eq(commandTasks.ventureId, access.id), eq(commandTasks.requestId, task.requestId)),
        );
      if (
        existing &&
        existing.title === task.title &&
        existing.priority === task.priority &&
        existing.dueOn === task.dueOn
      ) {
        return { ok: true as const, data: existing };
      }
      return fail("CONFLICT", "This task was already submitted with different details.");
    });
  } catch (error) {
    rethrowRls(error);
  }
}

/** Completes or reopens a task (Operator+). Already in the requested state: no change. */
export async function setTaskStatus(
  actor: Actor,
  ventureId: string,
  input: unknown,
): Promise<CommandResult<CommandTask>> {
  const access = await resolveSelectedVenture(actor, ventureId, "command:manage_tasks");
  const parsed = taskStatusInput.safeParse(input);
  if (!parsed.success) return fail("NOT_FOUND", "This task no longer exists.");
  const { taskId, status } = parsed.data;

  try {
    return await withTenant(tenant(access), async (tx) => {
      const [updated] = await tx
        .update(commandTasks)
        .set({ status, statusChangedAt: new Date(), statusChangedBy: access.userId })
        .where(
          and(
            eq(commandTasks.id, taskId),
            eq(commandTasks.ventureId, access.id),
            ne(commandTasks.status, status),
          ),
        )
        .returning(taskColumns);
      if (updated) {
        await recordCommandEvent(
          tx,
          access,
          status === "done" ? CommandEvents.taskCompleted : CommandEvents.taskReopened,
          updated.id,
        );
        return { ok: true as const, data: updated };
      }
      const [current] = await tx
        .select(taskColumns)
        .from(commandTasks)
        .where(and(eq(commandTasks.id, taskId), eq(commandTasks.ventureId, access.id)));
      if (!current) return fail("NOT_FOUND", "This task no longer exists.");
      // Visible but not updated in the requested direction: the UPDATE policy refused it.
      if (current.status !== status) {
        throw new VenturePermissionError(rolesWith("command:manage_tasks"));
      }
      return { ok: true as const, data: current };
    });
  } catch (error) {
    rethrowRls(error);
  }
}

export {
  clockTime,
  dueLabel,
  localDate,
  longDate,
  relativeTime,
  shortDate,
  type DueLabel,
} from "./calendar";
export {
  commandMetrics,
  formatChange,
  formatMetricValue,
  METRICS,
  type CommandMetric,
  type MetricKey,
} from "./metrics";
export {
  CommandEvents,
  commandQuery,
  createTaskInput,
  TASK_PRIORITIES,
  taskStatusInput,
  type TaskPriority,
  type TaskStatus,
} from "./policy";
export { evaluateSignals, RULES, type CommandSignal, type SignalSeverity } from "./signals";
