/** Result of an onboarding form action. `values` re-populates the form after an error. */
export type OnboardingFormState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string>;
      values?: Record<string, string>;
    }
  /**
   * Onboarding completed: the venture was activated by the server-side completion function.
   * Rendering the Figma "complete" state from this result is a UX state only (spec §5).
   */
  | { status: "complete" };

export const idleState: OnboardingFormState = { status: "idle" };
