/** Result of a team action. `values` re-populates the invite form after an error. */
export type TeamFormState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string>;
      values?: Record<string, string>;
    };

export const idleTeamState: TeamFormState = { status: "idle" };
