import type { OnboardingView } from "@/modules/ventures";

const STEPS = [
  { key: "business", label: "Business details" },
  { key: "data_connections", label: "Data connections" },
  { key: "review", label: "Review and confirm" },
] as const;

/** Text progress indicator (not colour-only). */
export function StepIndicator({
  view,
  current,
}: {
  view: OnboardingView;
  current: (typeof STEPS)[number]["key"];
}) {
  const done = {
    business: view.onboarding.businessCompletedAt !== null,
    data_connections: view.onboarding.dataConnectionsCompletedAt !== null,
    review: view.onboarding.reviewCompletedAt !== null,
  };
  return (
    <nav aria-label="Onboarding progress">
      <ol>
        {STEPS.map((s, i) => (
          <li key={s.key} aria-current={s.key === current ? "step" : undefined}>
            Step {i + 1}: {s.label}
            {done[s.key] ? " (complete)" : s.key === current ? " (current)" : ""}
          </li>
        ))}
      </ol>
    </nav>
  );
}
