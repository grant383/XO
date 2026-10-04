/** Result shown by an auth form after a server action. Never contains secrets. */
export type FormState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> };

export const idle: FormState = { status: "idle" };
