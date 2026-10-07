import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCommandCentre, dueLabel } from "@/modules/command";
import { growthGap } from "@/modules/growth-command";
import {
  can,
  resolveSelectedVenture,
  VentureNotFoundError,
  VentureStateError,
  type VentureAccess,
} from "@/modules/ventures";
import { requireActor } from "../../../../../actor";
import { NoVentureAccess } from "../../../no-access";
import { createTaskAction, setTaskStatusAction } from "../actions";
import { AddTaskForm, TaskToggle } from "../task-controls";
import { GROWTH_FIXTURE as fixture } from "./fixture";
import { GrowthScreen } from "./screen";
import styles from "./growth.module.css";

export const metadata: Metadata = { title: "£1M Growth Command" };
export const dynamic = "force-dynamic";

export default async function GrowthCommandPage({
  params,
}: {
  params: Promise<{ ventureId: string }>;
}) {
  const { ventureId } = await params;
  const actor = await requireActor(`/v/${ventureId}/command/growth-1m`);
  let access: VentureAccess;
  try {
    access = await resolveSelectedVenture(actor, ventureId);
  } catch (error) {
    if (error instanceof VentureNotFoundError) return <NoVentureAccess ventureId={ventureId} />;
    if (error instanceof VentureStateError) redirect("/");
    throw error;
  }
  if (!can(access.role, "command:view")) return <NoVentureAccess ventureId={ventureId} />;
  const snapshot = await getCommandCentre(actor, ventureId);
  const gap = growthGap({
    targetRevenue: fixture.annualTarget,
    forecastRevenue: fixture.annualRevenue,
    averageValue: fixture.averageValue,
    conversionRate: fixture.conversionRate,
  });
  return (
    <GrowthScreen gap={gap}>
      <details id="venture-tasks" className={styles.realTasks}>
        <summary>Venture tasks · existing backend</summary>
        <p>
          These are real Command Centre tasks. Sample execution rows above are separate and are
          never saved.
        </p>
        <ul aria-label="Venture tasks">
          {[...snapshot.openTasks, ...snapshot.completedTasks].map((task) => (
            <li key={task.id}>
              {snapshot.viewer.canManageTasks ? (
                <TaskToggle
                  action={setTaskStatusAction.bind(null, ventureId)}
                  taskId={task.id}
                  title={task.title}
                  done={task.status === "done"}
                />
              ) : (
                <span>{task.status === "done" ? "Done" : "Open"}</span>
              )}
              <span>{task.title}</span>
              <span>{dueLabel(task.dueOn, snapshot.today).label}</span>
            </li>
          ))}
        </ul>
        {!snapshot.openTasks.length && !snapshot.completedTasks.length ? (
          <p>No venture tasks yet.</p>
        ) : null}
        {snapshot.viewer.canManageTasks ? (
          <AddTaskForm action={createTaskAction.bind(null, ventureId)} requestId={randomUUID()} />
        ) : (
          <p>Viewer access · tasks are read-only.</p>
        )}
      </details>
    </GrowthScreen>
  );
}
