import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./app-shell.module.css";

type Crumb = { label: string; href?: string };

/**
 * Figma "Page chrome": breadcrumbs, title with an optional tag, subtitle and actions. The
 * current page is the last crumb and is announced with aria-current.
 */
export function PageHeader({
  crumbs,
  title,
  tag,
  children,
  actions,
}: {
  crumbs: Crumb[];
  title: string;
  tag?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={styles.pageChrome}>
      <nav aria-label="Breadcrumb">
        <ol className={styles.breadcrumbs}>
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={`${c.label}-${i}`}>
                {c.href && !last ? (
                  <Link href={c.href as Route}>{c.label}</Link>
                ) : (
                  <span aria-current={last ? "page" : undefined}>{c.label}</span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <div className={styles.pageHeader}>
        <div className={styles.titleCopy}>
          <div className={styles.titleRow}>
            <h1>{title}</h1>
            {tag}
          </div>
          {children ? <p className={styles.subtitle}>{children}</p> : null}
        </div>
        {actions ? <div className={styles.headerActions}>{actions}</div> : null}
      </div>
    </div>
  );
}

/** Page body: the 1120px content column with the breakpoint gutters. */
export function PageContent({ children }: { children: ReactNode }) {
  return <div className={styles.content}>{children}</div>;
}
