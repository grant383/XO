import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MONTHS, SECTORS, type OnboardingView } from "@/modules/ventures";
import { Alert, ButtonLink, Icon, StatusBadge } from "@/ui";
import { completeOnboardingAction } from "../../actions";
import { ConfirmOnboarding } from "../../forms";
import { loadOnboardingPage, stepPath } from "../../guard";
import {
  Divider,
  SetupCard,
  SetupHeading,
  StepProgress,
  SummaryCard,
  onboardingStyles as styles,
} from "../../parts";
import { ForbiddenNotice } from "../forbidden-notice";

export const metadata: Metadata = { title: "Review and confirm" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ ventureId: string }> };

const VERIFICATION_LABEL = {
  verified: "Verified",
  unavailable: "Not verified (service unavailable)",
  not_applicable: "Not applicable",
} as const;

function verificationOf(view: OnboardingView) {
  const status = view.onboarding.companyVerificationStatus;
  return status === "verified" || status === "unavailable" ? status : "not_applicable";
}

function Facts({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className={styles.facts}>
      {rows.map(([label, value]) => (
        <div key={label} className={styles.factRow}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Review and confirm (Figma 39:164) with the creating (54:27638) and complete (54:27717) states. */
export default async function ReviewStepPage({ params }: Props) {
  const { ventureId } = await params;
  const ctx = await loadOnboardingPage(ventureId);
  if (ctx.kind === "forbidden") return <ForbiddenNotice />;
  const { venture: v, onboarding: o } = ctx.view;
  if (!o.businessCompletedAt) redirect(stepPath(ventureId, "business"));
  if (!o.dataConnectionsCompletedAt) redirect(stepPath(ventureId, "data-connections"));

  const verification = verificationOf(ctx.view);
  const sector = SECTORS.find((s) => s.code === v.sector)?.label ?? "Not set";
  const fiscalYear = v.fiscalYearStartMonth ? MONTHS[v.fiscalYearStartMonth - 1]! : "Not set";

  const review = (
    <>
      <StepProgress step={3} label="Review and confirm" />
      <SetupHeading title="Review & confirm">
        Check the details for {v.name}. Confirming activates the venture and creates your workspace.
      </SetupHeading>
      <Divider />
      <div className={styles.sources}>
        <SummaryCard
          icon="building-2-sm"
          kicker="Business profile"
          title={v.name}
          edit={{ href: stepPath(ventureId, "business"), label: "Edit business details" }}
        >
          <Facts
            rows={[
              ["Legal name", v.legalName ?? "Not provided"],
              ["Sector", sector],
            ]}
          />
        </SummaryCard>
        <SummaryCard
          icon="database"
          kicker="Company verification"
          title={v.companyNumber ? `Companies House ${v.companyNumber}` : "No company number"}
          tone={verification === "verified" ? "success" : undefined}
          edit={{ href: stepPath(ventureId, "data-connections"), label: "Edit connections" }}
          badge={
            verification === "verified" ? (
              <StatusBadge tone="success">Verified</StatusBadge>
            ) : undefined
          }
        >
          <Facts rows={[["Verification", VERIFICATION_LABEL[verification]]]} />
        </SummaryCard>
        <SummaryCard icon="building-2-sm" kicker="Reporting" title={v.reportingCurrency}>
          <Facts
            rows={[
              ["Timezone", v.timezone],
              ["Financial year starts", fiscalYear],
            ]}
          />
        </SummaryCard>
        <SummaryCard
          icon="shield-check-md"
          kicker="Access & security"
          title="You become the Owner"
          tone="success"
        >
          <Facts
            rows={[
              ["Access", "Role-based, per venture"],
              ["Team", "Invite people after setup"],
            ]}
          />
        </SummaryCard>
      </div>
    </>
  );

  const creating = (
    <div className={styles.form} role="status" aria-live="polite">
      <div className={styles.progressCopy}>
        <span className={styles.progressStep}>Workspace setup</span>
        <StatusBadge tone="info">In progress</StatusBadge>
      </div>
      <div className={styles.stateBox}>
        <span className={styles.stateIcon} aria-hidden="true">
          <Icon name="loader-circle-lg" />
        </span>
        <p className={styles.stateTitle}>Creating your {v.name} workspace</p>
        <p className={styles.stateCopy}>
          Applying your reviewed setup. Keep this window open while DirectorXO activates the
          venture.
        </p>
        <p className={styles.stateStatus}>Activating venture…</p>
      </div>
    </div>
  );

  const complete = (
    <SetupCard wide>
      <div className={styles.successHead}>
        <span className={styles.successIcon} aria-hidden="true">
          <Icon name="badge-check" />
        </span>
        <div className={styles.successCopy}>
          <div className={styles.successTitleRow}>
            <h1>Your workspace is ready</h1>
            <StatusBadge tone="success">Active</StatusBadge>
          </div>
          <p className={styles.lede}>{v.name} is active and you are its Owner.</p>
        </div>
      </div>
      <Alert tone="success" title="Setup completed">
        Role-based access is in place. Only people you invite can see this venture.
      </Alert>
      <div className={styles.metrics}>
        <div className={styles.metric}>
          <p className={styles.metricLabel}>Workspace</p>
          <p className={styles.metricValue} data-tone="success">
            Live
          </p>
          <p className={styles.metricDetail}>Venture structure and permissions</p>
        </div>
        <div className={styles.metric}>
          <p className={styles.metricLabel}>Your role</p>
          <p className={styles.metricValue}>Owner</p>
          <p className={styles.metricDetail}>Full venture control</p>
        </div>
        <div className={styles.metric}>
          <p className={styles.metricLabel}>Companies House</p>
          <p className={styles.metricValue}>
            {verification === "verified" ? "Verified" : "Not verified"}
          </p>
          <p className={styles.metricDetail}>{v.companyNumber ?? "No company number"}</p>
        </div>
      </div>
      <div className={styles.recommended}>
        <h2 className={styles.recommendedLabel}>First recommended action</h2>
        <Link href={`/v/${ventureId}/settings/team` as Route} className={styles.actionCard}>
          <Icon name="users" />
          <span className={styles.actionTitle}>Invite your team</span>
          <span className={styles.actionCopy}>
            Add people to {v.name} and choose each person’s role.
          </span>
        </Link>
      </div>
      <div className={`${styles.actions} ${styles.actionsEnd}`}>
        <ButtonLink href={`/v/${ventureId}/command`}>
          Enter workspace
          <Icon name="arrow-right" />
        </ButtonLink>
      </div>
    </SetupCard>
  );

  return (
    <ConfirmOnboarding
      action={completeOnboardingAction.bind(null, ventureId)}
      backHref={stepPath(ventureId, "data-connections")}
      review={review}
      creating={creating}
      complete={complete}
    />
  );
}
