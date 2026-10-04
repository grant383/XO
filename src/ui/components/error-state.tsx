import type { ReactNode } from "react";
import { cx } from "../cx";
import { Icon, type IconName } from "./icon";
import styles from "./error-state.module.css";

export type ErrorTone = "info" | "danger" | "warning";

/**
 * Figma error state card (404 31:3604, 403 33:4456, 500 31:3692): icon tile, mono error
 * code, title, explanation, optional detail and actions. The code and title always
 * state the problem in text; tone is never carried by colour alone.
 */
export function ErrorState({
  tone,
  icon,
  code,
  title,
  description,
  detail,
  actions,
  footnote,
  as: Heading = "h1",
  className,
}: {
  tone: ErrorTone;
  icon: IconName;
  code: string;
  title: string;
  description: ReactNode;
  detail?: ReactNode;
  actions?: ReactNode;
  footnote?: ReactNode;
  as?: "h1" | "h2";
  className?: string;
}) {
  return (
    <section className={cx(styles.card, className)} data-tone={tone}>
      <span className={styles.icon} aria-hidden="true">
        <Icon name={icon} />
      </span>
      <div className={styles.copy}>
        <p className={styles.code}>{code}</p>
        <Heading className={styles.title}>{title}</Heading>
        <p className={styles.description}>{description}</p>
      </div>
      {detail}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
      {footnote ? <p className={styles.footnote}>{footnote}</p> : null}
    </section>
  );
}

/** "Required access / Current access" comparison inside a 403 state. */
export function AccessComparison({ required, current }: { required: string; current?: string }) {
  return (
    <dl className={styles.access}>
      <div>
        <dt>Required access</dt>
        <dd>{required}</dd>
      </div>
      {current ? (
        <div className={styles.accessCurrent}>
          <dt>Current access</dt>
          <dd>{current}</dd>
        </div>
      ) : null}
    </dl>
  );
}

/** Green assurance line inside a 500 state. */
export function Assurance({ children }: { children: ReactNode }) {
  return (
    <p className={styles.assurance}>
      <Icon name="shield-check-thin" />
      <span>{children}</span>
    </p>
  );
}
