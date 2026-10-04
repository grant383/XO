"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/ui";
import styles from "./app-shell.module.css";
import type { ShellNavItem } from "./types";

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

/** The current page label for the top-bar context ("Venture / Page"). */
export function CurrentPage({ sections }: { sections: { items: ShellNavItem[] }[] }) {
  const pathname = usePathname();
  const item = sections.flatMap((s) => s.items).find((i) => isActive(pathname, i));
  return item ? <span className={styles.contextPage}>{item.label}</span> : null;
}
