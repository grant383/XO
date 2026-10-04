import type { ReactNode } from "react";
import { cx } from "../cx";
import styles from "./badge.module.css";
import { Icon, type IconName } from "./icon";

export type BadgeTone = "success" | "warning" | "danger" | "neutral";

const DOT: Partial<Record<BadgeTone, IconName>> = {
  success: "status-success",
  warning: "status-warning",
  danger: "status-danger",
};

/** Figma Component/Status/*: a status pill whose label always states the status. */
export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  const dot = DOT[tone];
  return (
    <span className={cx(styles.badge, styles[tone], className)}>
      {dot ? <Icon name={dot} /> : null}
      {children}
    </span>
  );
}

/** Mono eyebrow tag ("BUSINESS COMMAND · SECURE ACCESS"). */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx(styles.eyebrow, className)}>{children}</span>;
}
