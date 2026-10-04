/** Result shown by an auth form after a server action. Never contains secrets. */
export type FormState =
  | { status: "idle" }
  /** `email` echoes the address the user just typed (never looked up), for "check your inbox". */
  | { status: "success"; message: string; email?: string }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> };

export const idle: FormState = { status: "idle" };
