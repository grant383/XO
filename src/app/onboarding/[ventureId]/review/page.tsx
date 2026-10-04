import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MONTHS, SECTORS } from "@/modules/ventures";
import { completeOnboardingAction } from "../../actions";
import { StepForm } from "../../forms";
import { loadOnboardingPage, stepPath } from "../../guard";
import { ForbiddenNotice } from "../forbidden-notice";
import { StepIndicator } from "../steps";

export const metadata: Metadata = { title: "Review and confirm" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ ventureId: string }> };

export default async function ReviewStepPage({ params }: Props) {
  const { ventureId } = await params;
  const ctx = await loadOnboardingPage(ventureId);
  if (ctx.kind === "forbidden") return <ForbiddenNotice />;
  const { venture: v, onboarding: o } = ctx.view;
  if (!o.businessCompletedAt) redirect(stepPath(ventureId, "business"));
  if (!o.dataConnectionsCompletedAt) redirect(stepPath(ventureId, "data-connections"));

  const rows: Array<[string, string]> = [
    ["Business name", v.name],
    ["Legal name", v.legalName ?? "Not provided"],
    ["Companies House number", v.companyNumber ?? "Not provided"],
    [
      "Companies House verification",
      o.companyVerificationStatus === "verified"
        ? "Verified"
        : o.companyVerificationStatus === "unavailable"
          ? "Not verified (service unavailable)"
          : "Not applicable",
    ],
    ["Sector", SECTORS.find((s) => s.code === v.sector)?.label ?? "Not set"],
    ["Reporting currency", v.reportingCurrency],
    ["Timezone", v.timezone],
    [
      "Financial year starts",
      v.fiscalYearStartMonth ? MONTHS[v.fiscalYearStartMonth - 1]! : "Not set",
    ],
  ];

  return (
    <>
      <StepIndicator view={ctx.view} current="review" />
      <h1>Review and confirm</h1>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p>
        <Link href={stepPath(ventureId, "business")}>Change business details</Link>
      </p>
      <p>Confirming activates the venture. You become its Owner.</p>
      <StepForm
        action={completeOnboardingAction.bind(null, ventureId)}
        label="Confirm and activate"
        pendingLabel="Activating…"
      />
    </>
  );
}
