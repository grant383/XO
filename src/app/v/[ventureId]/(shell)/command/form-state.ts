export type TaskFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Submitted values, returned on error so the form keeps them. */
  values?: Record<string, string>;
};

export const IDLE: TaskFormState = { status: "idle" };
