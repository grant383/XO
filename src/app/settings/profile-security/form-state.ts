/** Result of a Profile & Security server action. Never contains session tokens. */
export type SettingsState<T = undefined> =
  | { status: "idle" }
  | { status: "success"; message: string; data?: T }
  | {
      status: "error";
      message: string;
      /** Flow code, e.g. REAUTH_REQUIRED, which changes the next step offered. */
      code?: string;
      fieldErrors?: Record<string, string>;
    };

export const idle = { status: "idle" } as const;
