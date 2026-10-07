import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTask, getCommandCentre, setTaskStatus } from "@/modules/command";
import { VentureNotFoundError, VenturePermissionError } from "@/modules/ventures";
import { closePools } from "@/platform/db";
import { adminSql } from "../helpers/db";
import { activeVenture, actor, ventureAudit, type TestActor } from "../helpers/memberships";

/**
 * Command module (Figma 8:651, ADR-0024): Viewer+ reads the venture snapshot; Operator+
 * changes tasks; every change is retry-safe and audited; other ventures stay invisible.
 */
let admin: Sql;
let v: Awaited<ReturnType<typeof activeVenture<"owner" | "manager" | "operator" | "viewer">>>;
let other: Awaited<ReturnType<typeof activeVenture<"owner">>>;
let outsider: TestActor;

beforeAll(async () => {
  admin = adminSql();
  v = await activeVenture(admin, {
    owner: "owner",
    manager: "manager",
    operator: "operator",
    viewer: "viewer",
  });
  other = await activeVenture(admin, { owner: "owner" });
  outsider = await actor(admin, "outsider");
});
afterAll(async () => {
  await closePools();
  await admin.end();
});

const newTask = (title = "Call back supplier", extra: Record<string, unknown> = {}) => ({
  requestId: randomUUID(),
  title,
  priority: "high",
  dueOn: "",
  ...extra,
});

describe("Command Centre snapshot", () => {
  it("gives every role a read-only snapshot with no sample figures", async () => {
    const view = await getCommandCentre(v.people.viewer, v.ventureId);
    expect(view.viewer).toEqual({ role: "viewer", canManageTasks: false });
    expect(view.venture).toMatchObject({ id: v.ventureId, timezone: "Europe/London" });
    expect(view.metrics).toHaveLength(6);
    expect(view.metrics.every((m) => m.status === "awaiting_source")).toBe(true);
    expect(view.signals.map((s) => s.ruleId)).toContain("command.metrics.awaiting_sources");
    for (const role of ["owner", "manager", "operator"] as const) {
      expect((await getCommandCentre(v.people[role], v.ventureId)).viewer.canManageTasks).toBe(
        true,
      );
    }
  });

  it("is indistinguishable for non-members, unknown and malformed ventures", async () => {
    await expect(getCommandCentre(outsider, v.ventureId)).rejects.toBeInstanceOf(
      VentureNotFoundError,
    );
    await expect(getCommandCentre(v.people.owner, randomUUID())).rejects.toBeInstanceOf(
      VentureNotFoundError,
    );
    await expect(getCommandCentre(v.people.owner, "not-a-uuid")).rejects.toBeInstanceOf(
      VentureNotFoundError,
    );
    await expect(getCommandCentre(v.people.owner, other.ventureId)).rejects.toBeInstanceOf(
      VentureNotFoundError,
    );
  });

  it("orders open tasks by priority then due date and derives overdue signals in venture time", async () => {
    const owner = v.people.owner;
    for (const [title, priority, dueOn] of [
      ["Low later", "low", "2026-10-20"],
      ["High no date", "high", ""],
      ["High overdue", "high", "2026-10-01"],
      ["Medium soon", "medium", "2026-10-09"],
    ] as const) {
      expect((await createTask(owner, v.ventureId, newTask(title, { priority, dueOn }))).ok).toBe(
        true,
      );
    }
    const view = await getCommandCentre(owner, v.ventureId, new Date("2026-10-07T12:00:00Z"));
    const ours = view.openTasks.filter((t) =>
      ["Low later", "High no date", "High overdue", "Medium soon"].includes(t.title),
    );
    expect(ours.map((t) => t.title)).toEqual([
      "High overdue",
      "High no date",
      "Medium soon",
      "Low later",
    ]);
    expect(view.today).toBe("2026-10-07");
    const overdue = view.signals.find((s) => s.ruleId === "command.tasks.overdue");
    expect(overdue).toMatchObject({ severity: "danger" });
  });
});

describe("task changes", () => {
  it("creates once per request id, audits atomically and rejects a conflicting retry", async () => {
    const operator = v.people.operator;
    const input = newTask("Approve revised quote", { priority: "medium", dueOn: "2026-10-09" });
    const first = await createTask(operator, v.ventureId, input);
    expect(first).toMatchObject({
      ok: true,
      data: { title: "Approve revised quote", priority: "medium", dueOn: "2026-10-09" },
    });
    expect(await createTask(operator, v.ventureId, input)).toEqual(first);
    expect(await createTask(operator, v.ventureId, { ...input, title: "Other" })).toMatchObject({
      ok: false,
      code: "CONFLICT",
    });
    if (!first.ok) throw new Error("creation failed");
    const audit = (await ventureAudit(admin, v.ventureId)).filter(
      (a) => a.target_id === first.data.id,
    );
    expect(audit).toEqual([
      {
        action: "command.task.created",
        actor_user_id: operator.userId,
        subject_user_id: null,
        target_type: "command_task",
        target_id: first.data.id,
        metadata: { priority: "medium", hasDueDate: true },
        correlation_id: operator.correlationId,
      },
    ]);
  });

  it("returns field errors without writing", async () => {
    const result = await createTask(v.people.owner, v.ventureId, newTask("  ", { priority: "x" }));
    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
    if (result.ok) return;
    expect(Object.keys(result.fieldErrors ?? {}).sort()).toEqual(["priority", "title"]);
  });

  it("refuses Viewers before any write", async () => {
    await expect(
      createTask(v.people.viewer, v.ventureId, newTask("Viewer task")),
    ).rejects.toBeInstanceOf(VenturePermissionError);
    const [row] = await admin<{ count: number }[]>`
      select count(*)::int as count from command_tasks
      where venture_id = ${v.ventureId} and title = 'Viewer task'`;
    expect(row!.count).toBe(0);
  });

  it("completes and reopens idempotently with one audit record per real change", async () => {
    const created = await createTask(v.people.manager, v.ventureId, newTask("Order parts"));
    if (!created.ok) throw new Error("creation failed");
    const taskId = created.data.id;

    const done = await setTaskStatus(v.people.operator, v.ventureId, { taskId, status: "done" });
    expect(done).toMatchObject({ ok: true, data: { status: "done" } });
    expect(
      await setTaskStatus(v.people.operator, v.ventureId, { taskId, status: "done" }),
    ).toMatchObject({ ok: true, data: { status: "done" } });
    await expect(
      setTaskStatus(v.people.viewer, v.ventureId, { taskId, status: "open" }),
    ).rejects.toBeInstanceOf(VenturePermissionError);
    expect(
      await setTaskStatus(v.people.owner, v.ventureId, { taskId, status: "open" }),
    ).toMatchObject({ ok: true, data: { status: "open" } });

    const actions = (await ventureAudit(admin, v.ventureId))
      .filter((a) => a.target_id === taskId)
      .map((a) => [a.action, a.actor_user_id]);
    expect(actions).toEqual([
      ["command.task.created", v.people.manager.userId],
      ["command.task.completed", v.people.operator.userId],
      ["command.task.reopened", v.people.owner.userId],
    ]);

    const view = await getCommandCentre(v.people.viewer, v.ventureId);
    const change = view.changes.find((c) => c.id === `${taskId}:status`);
    expect(change).toMatchObject({
      kind: "task_reopened",
      title: "Order parts",
      actorName: "owner",
    });
  });

  it("cannot reach another venture's task, even with its id", async () => {
    const theirs = await createTask(other.people.owner, other.ventureId, newTask("Private task"));
    if (!theirs.ok) throw new Error("creation failed");
    expect(
      await setTaskStatus(v.people.owner, v.ventureId, { taskId: theirs.data.id, status: "done" }),
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
    const view = await getCommandCentre(v.people.owner, v.ventureId);
    expect(view.openTasks.some((t) => t.id === theirs.data.id)).toBe(false);
    expect(view.changes.some((c) => c.title === "Private task")).toBe(false);
    const [row] = await admin<{ status: string }[]>`
      select status from command_tasks where id = ${theirs.data.id}`;
    expect(row!.status).toBe("open");
  });

  it("stops a member removed after the page loaded", async () => {
    const temp = await actor(admin, "temp");
    await admin`insert into venture_memberships (venture_id, user_id, role)
                values (${v.ventureId}, ${temp.userId}, 'operator')`;
    expect((await createTask(temp, v.ventureId, newTask("Before removal"))).ok).toBe(true);
    await admin`update venture_memberships set status = 'removed'
                where venture_id = ${v.ventureId} and user_id = ${temp.userId}`;
    await expect(createTask(temp, v.ventureId, newTask("After removal"))).rejects.toBeInstanceOf(
      VentureNotFoundError,
    );
  });
});
