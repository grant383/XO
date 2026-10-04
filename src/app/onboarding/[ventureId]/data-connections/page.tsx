import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDataConnectionsStatus } from "@/modules/ventures";
import { completeDataConnectionsAction } from "../../actions";
import { StepForm } from "../../forms";
import { loadOnboardingPage, stepPath } from "../../guard";
import { ForbiddenNotice } from "../forbidden-notice";
import { StepIndicator } from "../steps";

export const metadata: Metadata = { title: "Data connections" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ ventureId: string }> };

const VERIFICATION_TEXT = {
  verified: "Verified with Companies House",
  unavailable: "Not verified: Companies House was unavailable. You can continue.",
  not_provided: "No company number provided",
  not_found: "Company number not found",
} as const;

/** P0: shows foundation connection status only. P1 provider connections are not offered. */
export default async function DataConnectionsStepPage({ params }: Props) {
  const { ventureId } = await params;
  const ctx = await loadOnboardingPage(ventureId);
  if (ctx.kind === "forbidden") return <ForbiddenNotice />;
  if (!ctx.view.onboarding.businessCompletedAt) redirect(stepPath(ventureId, "business"));
  const status = await getDataConnectionsStatus(ctx.actor, ventureId);

  return (
    <>
      <StepIndicator view={ctx.view} current="data_connections" />
      <h1>Data connections</h1>
      <dl>
        <dt>Companies House</dt>
        <dd>
          {VERIFICATION_TEXT[status.companiesHouse.verification]}
          {!status.companiesHouse.configured ? " (lookup not configured in this environment)" : ""}
        </dd>
        <dt>Transactional email</dt>
        <dd>{status.email.configured ? "Available" : "Not configured"}</dd>
        <dt>Subscription</dt>
        <dd>Not set up yet. You can set up billing after onboarding.</dd>
      </dl>
      <p>
        <Link href={stepPath(ventureId, "business")}>Back to business details</Link>
      </p>
      <StepForm
        action={completeDataConnectionsAction.bind(null, ventureId)}
        label="Continue to review"
        pendingLabel="Saving…"
      />
    </>
  );
}
