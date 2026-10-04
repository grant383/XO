import type { ReactNode } from "react";
import { cx } from "../cx";
import { Icon, type IconName } from "./icon";
import styles from "./state.module.css";

type StateProps = {
  title: string;
  description?: ReactNode;
  /** Heading level for the title; pages pick the level that fits their outline. */
  as?: "h1" | "h2" | "h3";
  className?: string;
};

/**
 * Figma Component/State/Empty (Generic empty, 54:27962): icon tile, title, guidance and an
 * optional primary action. Used whenever a collection or workspace has nothing to show.
 */
export function EmptyState({
  title,
  description,
  icon = "inbox",
  action,
  as: Heading = "h2",
  className,
}: StateProps & { icon?: IconName; action?: ReactNode }) {
  return (
    <div className={cx(styles.state, className)}>
      <span className={styles.icon} aria-hidden="true">
        <Icon name={icon} />
      </span>
      <div className={styles.copy}>
        <Heading className={styles.title}>{title}</Heading>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/**
 * Figma Component/State/Loading (Application loading, 54:27792): announced politely as a
 * status so assistive technology knows the page is still working.
 */
export function LoadingState({
  title,
  description,
  status,
  as: Heading = "h2",
  className,
}: StateProps & { status?: string }) {
  return (
    <div className={cx(styles.state, className)} role="status" aria-live="polite">
      <span className={cx(styles.icon, styles.spinning)} aria-hidden="true">
        <Icon name="loader-circle-lg" />
      </span>
      <div className={styles.copy}>
        <Heading className={styles.title}>{title}</Heading>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {status ? <p className={styles.status}>{status}</p> : null}
    </div>
  );
}
