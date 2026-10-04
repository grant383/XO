import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { cx, Icon, type IconName } from "@/ui";
import styles from "./auth.module.css";

export function AuthHeading({
  title,
  children,
  centered,
}: {
  title: string;
  children?: ReactNode;
  centered?: boolean;
}) {
  return (
    <div className={cx(styles.heading, centered && styles.centered)}>
      <h1>{title}</h1>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function BackLink({ href, children }: { href: Route; children: ReactNode }) {
  return (
    <Link href={href} className={styles.backLink}>
      <Icon name="arrow-left" />
      {children}
    </Link>
  );
}

/** Security reassurance line (shield-check). */
export function SecurityNote({ children }: { children: ReactNode }) {
  return (
    <p className={styles.note}>
      <Icon name="shield-check" />
      <span>{children}</span>
    </p>
  );
}

/** "Already have an account? Sign in" style path between flows. */
export function FlowPath({ prompt, href, label }: { prompt: string; href: string; label: string }) {
  return (
    <p className={styles.path}>
      <span>{prompt}</span>
      <Link href={href as Route}>{label}</Link>
    </p>
  );
}

export function InfoBox({
  icon,
  title,
  children,
}: {
  icon?: IconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.box}>
      <p className={styles.boxTitle}>
        {icon ? <Icon name={icon} /> : null}
        {title}
      </p>
      <p className={styles.boxBody}>{children}</p>
    </div>
  );
}

/** Password requirements panel, stated from the enforced policy rather than design copy. */
export function PasswordRequirements({
  minLength,
  maxLength,
}: {
  minLength: number;
  maxLength: number;
}) {
  return (
    <div className={styles.box}>
      <p className={styles.boxLabel} id="password-requirements">
        Password requirements
      </p>
      <ul className={styles.requirements} aria-labelledby="password-requirements">
        <li>
          <Icon name="status-requirement" />
          {minLength} or more characters
        </li>
        <li>
          <Icon name="status-requirement" />
          No more than {maxLength} characters
        </li>
        <li>
          <Icon name="status-requirement" />A passphrase you do not use anywhere else
        </li>
      </ul>
    </div>
  );
}

export function StateIcon({ name }: { name: IconName }) {
  return (
    <span className={styles.stateIcon} aria-hidden="true">
      <Icon name={name} />
    </span>
  );
}

export const authStyles = styles;
