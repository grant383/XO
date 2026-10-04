/** Result of an onboarding form action. `values` re-populates the form after an error. */
export type OnboardingFormState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string>;
      values?: Record<string, string>;
    };

export const idleState: OnboardingFormState = { status: "idle" };
