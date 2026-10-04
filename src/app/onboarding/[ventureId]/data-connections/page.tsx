import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDataConnectionsStatus, type DataConnectionsStatus } from "@/modules/ventures";
import { StatusBadge, type BadgeTone, type IconName } from "@/ui";
import { completeDataConnectionsAction } from "../../actions";
import { StepForm } from "../../forms";
import { loadOnboardingPage, stepPath } from "../../guard";
import {
  Divider,
  IconTile,
  SetupCard,
  SetupHeading,
  StepProgress,
  onboardingStyles as styles,
} from "../../parts";
import { ForbiddenNotice } from "../forbidden-notice";

export const metadata: Metadata = { title: "Data connections" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ ventureId: string }> };

type Source = {
  kicker: string;
  name: string;
  detail: string;
  icon: IconName;
  status: { tone: BadgeTone; label: string };
};

const VERIFICATION: Record<
  DataConnectionsStatus["companiesHouse"]["verification"],
  { tone: BadgeTone; label: string; detail: string }
> = {
  verified: { tone: "success", label: "Verified", detail: "Company number verified" },
  unavailable: {
    tone: "warning",
    label: "Not verified",
    detail: "Companies House was unavailable. You can continue.",
  },
  not_provided: { tone: "neutral", label: "Not provided", detail: "No company number provided" },
  not_found: { tone: "warning", label: "Not found", detail: "Company number not found" },
};

function sourcesOf(status: DataConnectionsStatus): Source[] {
  const ch = VERIFICATION[status.companiesHouse.verification];
  return [
    {
      kicker: "Company registry",
      name: "Companies House",
      detail: status.companiesHouse.configured
        ? ch.detail
        : `${ch.detail} (lookup not configured in this environment)`,
      icon: "building-2",
      status: ch,
    },
    {
      kicker: "Notifications",
      name: "Transactional email",
      detail: "Invitations, verification and security notices",
      icon: "mail",
      status: status.email.configured
        ? { tone: "success", label: "Available" }
        : { tone: "neutral", label: "Not configured" },
    },
    {
      kicker: "Billing",
      name: "Subscription",
      detail: "You can set up billing after onboarding",
      icon: "clock-3",
      status: { tone: "neutral", label: "Not set up" },
    },
  ];
}

/**
 * Connect business data (Figma 33:3447). P0 shows the foundation connection status only;
 * provider connections (accounting, CRM, calendar, banking) arrive with P1 integrations
 * and are not offered here.
 */
export default async function DataConnectionsStepPage({ params }: Props) {
  const { ventureId } = await params;
  const ctx = await loadOnboardingPage(ventureId);
  if (ctx.kind === "forbidden") return <ForbiddenNotice />;
  if (!ctx.view.onboarding.businessCompletedAt) redirect(stepPath(ventureId, "business"));
  const sources = sourcesOf(await getDataConnectionsStatus(ctx.actor, ventureId));
  const ready = sources.filter((s) => s.status.tone === "success").length;

  return (
    <SetupCard>
      <StepProgress step={2} label="Data connections" />
      <SetupHeading title="Connect your business data">
        Review what {ctx.view.venture.name} is connected to. Accounting, CRM, calendar and banking
        connections are not available yet.
      </SetupHeading>
      <Divider />
      <ul className={styles.sources} aria-label="Connection status">
        {sources.map((s, i) => (
          <li
            key={s.name}
            className={`${styles.source} ${i === sources.length - 1 && sources.length % 2 ? styles.sourceFull : ""}`}
            data-tone={s.status.tone === "success" ? "success" : undefined}
          >
            <IconTile icon={s.icon} tone={s.status.tone === "success" ? "success" : undefined} />
            <div className={styles.sourceCopy}>
              <span className={styles.kicker}>{s.kicker}</span>
              <span className={styles.sourceName}>{s.name}</span>
              <span className={styles.sourceDetail}>{s.detail}</span>
            </div>
            <StatusBadge tone={s.status.tone}>{s.status.label}</StatusBadge>
          </li>
        ))}
      </ul>
      <p className={styles.summaryBar}>
        <span>
          {ready} of {sources.length} ready
        </span>
        <strong>Read-only checks · Permission controlled</strong>
      </p>
      <StepForm
        action={completeDataConnectionsAction.bind(null, ventureId)}
        label="Review & confirm"
        pendingLabel="Saving…"
        back={{ href: stepPath(ventureId, "business"), label: "Back" }}
      />
    </SetupCard>
  );
}
