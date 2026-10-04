import type { Route } from "next";
import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../cx";
import styles from "./button.module.css";
import { Icon } from "./icon";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger";

type Common = { variant?: ButtonVariant; block?: boolean; children: ReactNode };

type ButtonProps = Common &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
    /** Pending state: keeps the label for context and blocks resubmission. */
    loading?: boolean;
    loadingLabel?: string;
  };

function classes(variant: ButtonVariant, block?: boolean, extra?: string) {
  return cx(styles.button, styles[variant], block && styles.block, extra);
}

/** Figma Component/Button/{Primary,Secondary,Tertiary,Danger}. */
export function Button({
  variant = "primary",
  block,
  loading,
  loadingLabel,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={classes(variant, block, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <Icon name="loader-circle" className={styles.spinner} /> : null}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
}

type ButtonLinkProps = Common & { href: Route | string; className?: string };

/** Navigation styled as a button. Navigation stays a link for assistive tech. */
export function ButtonLink({
  href,
  variant = "primary",
  block,
  className,
  children,
}: ButtonLinkProps) {
  return (
    <Link href={href as Route} className={classes(variant, block, className)}>
      {children}
    </Link>
  );
}
