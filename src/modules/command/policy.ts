import { z } from "zod";

export const TASK_PRIORITIES = ["high", "medium", "low"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type TaskStatus = "open" | "done";

/** A new Command Centre task. `requestId` makes creation retry-safe. */
export const createTaskInput = z
  .object({
    requestId: z.uuid(),
    title: z.string().trim().min(1, "Enter a task").max(200, "Use 200 characters or fewer"),
    priority: z.enum(TASK_PRIORITIES, { error: "Choose a priority" }),
    dueOn: z
      .union([z.literal(""), z.iso.date({ error: "Enter a valid date" })])
      .optional()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || (v >= "2000-01-01" && v <= "2100-12-31"), "Enter a valid date"),
  })
  .strict();
export type CreateTaskInput = z.input<typeof createTaskInput>;

/** Completing or reopening is an explicit target state, so a retry is harmless. */
export const taskStatusInput = z
  .object({ taskId: z.uuid(), status: z.enum(["open", "done"]) })
  .strict();

export const commandQuery = z.object({ ventureId: z.uuid() }).strict();

/** Canonical Command audit actions. Metadata never contains task titles. */
export const CommandEvents = {
  taskCreated: "command.task.created",
  taskCompleted: "command.task.completed",
  taskReopened: "command.task.reopened",
} as const;
