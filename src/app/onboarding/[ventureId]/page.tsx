import { redirect } from "next/navigation";
import { loadOnboardingPage, resumePath } from "../guard";

type Props = { params: Promise<{ ventureId: string }> };

/** Sends the Owner to the current onboarding step (server-authoritative). */
export default async function OnboardingVenturePage({ params }: Props) {
  const { ventureId } = await params;
  const ctx = await loadOnboardingPage(ventureId);
  if (ctx.kind === "forbidden") redirect("/");
  redirect(resumePath(ventureId, ctx.view.onboarding.currentStep));
}
