import type { ReactNode } from "react";
import { cx } from "../cx";
import styles from "./alert.module.css";
import { Icon, type IconName } from "./icon";

export type AlertTone = "error" | "warning" | "success" | "info";

const ICON: Record<AlertTone, IconName> = {
  error: "circle-x",
  warning: "triangle-alert",
  success: "circle-check",
  info: "info",
};

type Props = {
  tone: AlertTone;
  title: ReactNode;
  children?: ReactNode;
  id?: string;
  className?: string;
};

/**
 * Figma Component/Alert/{Error,Warning,Success,Info}. Errors are announced
 * assertively (role="alert"); other tones politely (role="status").
 * Tone is never carried by colour alone: icon and title text accompany it.
 */
export function Alert({ tone, title, children, id, className }: Props) {
  return (
    <div
      id={id}
      role={tone === "error" ? "alert" : "status"}
      className={cx(styles.alert, styles[tone], className)}
    >
      <Icon name={ICON[tone]} className={styles.icon} />
      <div className={styles.copy}>
        <p className={styles.title}>{title}</p>
        {children ? <div className={styles.body}>{children}</div> : null}
      </div>
    </div>
  );
}
