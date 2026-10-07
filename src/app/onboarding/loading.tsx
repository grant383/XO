import { LoadingState } from "@/ui";

/** Application loading state (Figma 54:27792) inside the onboarding chrome. */
export default function OnboardingLoading() {
  return (
    <LoadingState
      title="Loading venture setup"
      description="Checking your access and saved progress."
      status="Loading…"
    />
  );
}
