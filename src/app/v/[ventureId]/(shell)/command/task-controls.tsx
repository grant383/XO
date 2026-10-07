"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert, Button, ErrorSummary, Icon, SelectField, TextField } from "@/ui";
import { useOnline } from "@/ui/hooks/use-online";
import { IDLE, type TaskFormState } from "./form-state";
import styles from "./command.module.css";

type Action = (prev: TaskFormState, data: FormData) => Promise<TaskFormState>;

/**
 * Figma "What to do" checkbox. A real form, so completion works before hydration; the
 * server decides whether the change is allowed. Offline, changes are disabled (spec §11:
 * P1 offline is read-only).
 */
export function TaskToggle({
  action,
  taskId,
  title,
  done,
}: {
  action: Action;
  taskId: string;
  title: string;
  done: boolean;
}) {
  const online = useOnline();
  const [state, formAction, pending] = useActionState(action, IDLE);
  return (
    <form action={formAction} className={styles.toggleForm}>
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="status" value={done ? "open" : "done"} />
      <button
        type="submit"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Reopen “${title}”` : `Mark “${title}” as done`}
        className={styles.checkbox}
        disabled={pending || !online}
        aria-busy={pending || undefined}
      >
        <span className={styles.checkboxBox}>{done ? <Icon name="check" /> : null}</span>
      </button>
      {state.status === "error" ? (
        <p role="alert" className={styles.rowError}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

const PRIORITY_OPTIONS = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

/** Adds a task. `requestId` makes a retried submission create the task only once. */
export function AddTaskForm({ action, requestId }: { action: Action; requestId: string }) {
  const online = useOnline();
  const [state, formAction, pending] = useActionState(action, IDLE);
  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status === "error") summaryRef.current?.focus();
  }, [state]);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const values = state.status === "error" ? state.values : undefined;
  const hasFieldErrors = Object.keys(errors).length > 0;
  return (
    // A new requestId arrives with every server render, remounting a fresh form.
    <form action={formAction} className={styles.addForm} key={requestId}>
      <h3 className={styles.addTitle}>Add a task</h3>
      {!online ? (
        <p role="status" className={styles.note}>
          You are offline. Reconnect to add or update tasks.
        </p>
      ) : null}
      {state.status === "error" ? (
        <ErrorSummary
          ref={summaryRef}
          title="We couldn’t add the task"
          detail={hasFieldErrors ? undefined : state.message}
          fieldErrors={
            hasFieldErrors
              ? Object.fromEntries(Object.entries(errors).map(([k, v]) => [`task-${k}`, v]))
              : undefined
          }
        />
      ) : null}
      {state.status === "success" ? <Alert tone="success" title={state.message ?? ""} /> : null}
      <input type="hidden" name="requestId" value={requestId} />
      <div className={styles.addFields}>
        <TextField
          id="task-title"
          name="title"
          label="Task"
          required
          maxLength={200}
          autoComplete="off"
          disabled={pending}
          defaultValue={values?.title}
          error={errors.title}
          className={styles.addTitleField}
        />
        <SelectField
          id="task-priority"
          name="priority"
          label="Priority"
          required
          options={PRIORITY_OPTIONS}
          disabled={pending}
          defaultValue={values?.priority ?? "medium"}
          error={errors.priority}
        />
        <TextField
          id="task-dueOn"
          name="dueOn"
          label="Due date (optional)"
          type="date"
          disabled={pending}
          defaultValue={values?.dueOn}
          error={errors.dueOn}
        />
        <Button type="submit" loading={pending} loadingLabel="Adding…" disabled={!online}>
          <Icon name="plus" />
          Add task
        </Button>
      </div>
    </form>
  );
}
