import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { cx, Icon, type IconName } from "@/ui";
import styles from "./onboarding.module.css";

export const TOTAL_STEPS = 3;

export function SetupCard({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <section className={cx(styles.card, wide && styles.cardWide)}>{children}</section>;
}

/** "STEP 1 OF 3 · 33% COMPLETE" with the Figma progress track (not colour-only). */
export function StepProgress({ step, label }: { step: 1 | 2 | 3; label: string }) {
  const percent = Math.round((step / TOTAL_STEPS) * 100);
  return (
    <div className={styles.progressHeading}>
      <div className={styles.progressCopy}>
        <span className={styles.progressStep}>
          Step {step} of {TOTAL_STEPS}
        </span>
        <span>{percent}% complete</span>
      </div>
      <div
        className={styles.track}
        role="progressbar"
        aria-label="Venture setup progress"
        aria-valuemin={0}
        aria-valuemax={TOTAL_STEPS}
        aria-valuenow={step}
        aria-valuetext={`Step ${step} of ${TOTAL_STEPS}: ${label}`}
      >
        <div className={styles.fill} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function SetupHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={styles.heading}>
      <h1>{title}</h1>
      {children ? <p className={styles.lede}>{children}</p> : null}
    </div>
  );
}

export function Divider() {
  return <hr className={styles.divider} />;
}

export function IconTile({
  icon,
  tone,
  small,
}: {
  icon: IconName;
  tone?: "success";
  small?: boolean;
}) {
  return (
    <span className={cx(styles.tile, small && styles.tileSm)} data-tone={tone} aria-hidden="true">
      <Icon name={icon} />
    </span>
  );
}

/** Review summary card (Figma 39:187): kicker, optional edit link, title and facts. */
export function SummaryCard({
  icon,
  kicker,
  title,
  edit,
  tone,
  badge,
  children,
}: {
  icon: IconName;
  kicker: string;
  title: string;
  edit?: { href: string; label: string };
  tone?: "success";
  badge?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={styles.summaryCard} data-tone={tone}>
      <div className={styles.summaryHead}>
        <div className={styles.identity}>
          <IconTile icon={icon} tone={tone} small />
          <h2 className={styles.kicker}>{kicker}</h2>
        </div>
        {edit ? (
          <Link href={edit.href as Route} className={styles.editLink}>
            {edit.label}
          </Link>
        ) : null}
      </div>
      <div className={styles.summaryTitleRow}>
        <p className={styles.summaryTitle}>{title}</p>
        {badge}
      </div>
      {children}
    </div>
  );
}

export const onboardingStyles = styles;
