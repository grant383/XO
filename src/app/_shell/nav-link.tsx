"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/ui";
import styles from "./app-shell.module.css";
import type { ShellNavItem, ShellNavSection } from "./types";

export function isActive(pathname: string, item: ShellNavItem) {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Figma Component/Nav Item/{Default,Active}. The active item is announced as the page. */
export function NavLink({ item }: { item: ShellNavItem }) {
  const active = isActive(usePathname(), item);
  return (
    <Link
      href={item.href as Route}
      className={styles.navItem}
      aria-current={active ? "page" : undefined}
      title={item.label}
    >
      <Icon name="layout-grid" />
      <span className={styles.navLabel}>{item.label}</span>
    </Link>
  );
}

/**
 * The current page for the top-bar context: "Venture / Section / Page" (Figma 8:651), or
 * "Account / Page" when `withSection` is off.
 */
export function CurrentPage({
  sections,
  withSection,
}: {
  sections: ShellNavSection[];
  withSection: boolean;
}) {
  const pathname = usePathname();
  for (const section of sections) {
    const item = section.items.find((i) => isActive(pathname, i));
    if (!item) continue;
    return (
      <>
        {withSection ? (
          <>
            <span className={styles.contextSection}>{section.label}</span>
            <span className={styles.contextDivider} aria-hidden="true">
              /
            </span>
          </>
        ) : null}
        <span className={styles.contextPage}>{item.label}</span>
      </>
    );
  }
  return null;
}
