import type { OnboardingStep } from "@/modules/ventures";

export type StepSegment = "business" | "data-connections" | "review";

export const stepPath = (ventureId: string, step: StepSegment) =>
  `/onboarding/${ventureId}/${step}` as const;

const SEGMENT: Record<Exclude<OnboardingStep, "completed">, StepSegment> = {
  business: "business",
  data_connections: "data-connections",
  review: "review",
};

/** Where a venture resumes onboarding, from its persisted server-side `currentStep`. */
export function resumePath(ventureId: string, currentStep: OnboardingStep) {
  return currentStep === "completed" ? "/" : stepPath(ventureId, SEGMENT[currentStep]);
}
