"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createTask, setTaskStatus, type CommandResult } from "@/modules/command";
import {
  VentureNotFoundError,
  VenturePermissionError,
  VentureStateError,
} from "@/modules/ventures";
import { logger } from "@/platform/observability/logger";
import { requireActor } from "../../../../actor";
import type { TaskFormState } from "./form-state";

/**
 * Untrusted entry points: each action re-authenticates, and the command module
 * re-authorises `command:manage_tasks` and writes under RLS. Ids are only references.
 */
const text = (data: FormData, name: string) => {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
};

const commandPath = (ventureId: string) => `/v/${ventureId}/command`;

async function run(
  ventureId: string,
  successMessage: string,
  operation: (actor: Awaited<ReturnType<typeof requireActor>>) => Promise<CommandResult<unknown>>,
  values?: Record<string, string>,
): Promise<TaskFormState> {
  const actor = await requireActor(commandPath(ventureId));
  let result: CommandResult<unknown>;
  try {
    result = await operation(actor);
  } catch (error) {
    if (error instanceof VentureNotFoundError) {
      return { status: "error", message: "You no longer have access to this venture." };
    }
    if (error instanceof VenturePermissionError) {
      return { status: "error", message: "Your role can view tasks but not change them." };
    }
    if (error instanceof VentureStateError) redirect("/");
    logger.error(
      { correlationId: actor.correlationId, event: "command.task.failed" },
      "Command task change failed",
    );
    return { status: "error", message: "The change could not be saved. Please try again.", values };
  }
  revalidatePath(commandPath(ventureId));
  if (!result.ok) {
    return { status: "error", message: result.message, fieldErrors: result.fieldErrors, values };
  }
  return { status: "success", message: successMessage };
}

export async function createTaskAction(
  ventureId: string,
  _prev: TaskFormState,
  data: FormData,
): Promise<TaskFormState> {
  const values = {
    requestId: text(data, "requestId"),
    title: text(data, "title"),
    priority: text(data, "priority"),
    dueOn: text(data, "dueOn"),
  };
  return run(
    ventureId,
    `Added “${values.title.trim()}”.`,
    (actor) => createTask(actor, ventureId, values),
    values,
  );
}

export async function setTaskStatusAction(
  ventureId: string,
  _prev: TaskFormState,
  data: FormData,
): Promise<TaskFormState> {
  const status = text(data, "status");
  return run(ventureId, status === "done" ? "Task completed." : "Task reopened.", (actor) =>
    setTaskStatus(actor, ventureId, { taskId: text(data, "taskId"), status }),
  );
}
