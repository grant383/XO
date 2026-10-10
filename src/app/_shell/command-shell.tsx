"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { Brand, Icon } from "@/ui";
import { AccountMenu } from "./account-menu";
import styles from "./command-shell.module.css";
import { isActive } from "./nav-link";
import type { ShellNavItem, ShellNavSection, ShellUser, ShellVenture } from "./types";
import { VentureSwitcher } from "./venture-switcher";

const sections = [
  { label: "Portfolio", items: ["Portfolio Command", "Venture Pipeline", "Capital"] },
  {
    label: "Build",
    items: [
      "Idea Lab",
      "Research",
      "Goal Architect",
      "Blueprint",
      "Market",
      "Marketing",
      "Sales",
      "Operations",
      "People",
      "Assets",
      "Funding",
      "Financials",
      "Compliance",
      "Systems",
      "Risk",
      "Launch",
    ],
  },
  {
    label: "Operate",
    items: [
      "Command",
      "£1M Growth Command",
      "Clients",
      "Finance",
      "Operations",
      "Scheduling",
      "Growth",
      "Technology",
    ],
  },
];

/** Breadcrumb label per Command-shell route; anything else under /command is Command. */
const PAGE_LABELS = [
  ["/command/growth-1m", "£1M Growth Command"],
  ["/operate/crm", "Clients"],
  ["/operate/finance", "Finance"],
  ["/operate/operations", "Operations"],
  ["/operate/schedule", "Scheduling"],
  ["/operate/growth", "Growth"],
  ["/operate/technology", "Technology"],
] as const;

/** Operate items gated by role rather than by shipping status. */
const roleGated = new Set(["Clients", "Operations", "Scheduling", "Growth", "Technology"]);

/**
 * Node 8:651 has its own dense navigation. An item links only when the server-built nav
 * model (role-checked in the venture layout) contains it; unshipped or unauthorised
 * destinations stay visible but inert. Sections the Figma frame does not draw (System:
 * Profile & Security, Team & permissions) follow it in the same style.
 */
export function CommandShell({
  venture,
  ventures,
  user,
  nav,
  children,
}: {
  venture: ShellVenture;
  ventures: ShellVenture[];
  user: ShellUser;
  nav: ShellNavSection[];
  children: ReactNode;
}) {
  const menu = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const growth = pathname.endsWith("/command/growth-1m");
  const operateGrowth = pathname.endsWith("/operate/growth");
  const finance = pathname.endsWith("/operate/finance");
  const operations = pathname.endsWith("/operate/operations");
  const technology = pathname.endsWith("/operate/technology");
  const crm = pathname.endsWith("/operate/crm");
  const schedule = pathname.endsWith("/operate/schedule");

  // Close the mobile menu after navigation (including a venture switch).
  useEffect(() => {
    if (menu.current?.open) menu.current.close();
  }, [pathname]);

  const authorised = (section: string, label: string) =>
    nav.find((s) => s.label === section)?.items.find((i) => i.label === label);
  const link = (item: ShellNavItem) => (
    <Link
      href={item.href as Route}
      aria-current={isActive(pathname, item) ? "page" : undefined}
      onClick={() => menu.current?.close()}
    >
      {item.label}
    </Link>
  );
  const figmaLabels = new Set(sections.map((s) => s.label));
  const extra = nav.filter((s) => !figmaLabels.has(s.label));
  const navigation = (
    <>
      <div className={styles.brand}>
        <Brand compact />
      </div>
      <div className={styles.venture}>
        <VentureSwitcher current={venture} ventures={ventures} />
      </div>
      <div className={styles.navigation}>
        {sections.map((section) => (
          <nav key={section.label} aria-label={section.label}>
            <p className={styles.sectionLabel}>{section.label}</p>
            <ul>
              {section.items.map((label) => {
                const item = authorised(section.label, label);
                return (
                  <li key={label}>
                    {item ? (
                      link(item)
                    ) : (
                      <span
                        aria-disabled="true"
                        title={
                          section.label === "Operate" && roleGated.has(label)
                            ? "Operator access required"
                            : "Module not yet available"
                        }
                      >
                        {label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>
        ))}
        {extra.map((section) => (
          <nav key={section.label} aria-label={section.label}>
            <p className={styles.sectionLabel}>{section.label}</p>
            <ul>
              {section.items.map((item) => (
                <li key={item.href}>{link(item)}</li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className={styles.profile}>
        <AccountMenu user={user} context={venture.roleLabel} />
      </div>
    </>
  );
  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <aside className={styles.sidebar} aria-label="Venture navigation">
        {navigation}
      </aside>
      <dialog
        ref={menu}
        className={styles.menu}
        aria-label="Menu"
        onClick={(e) => {
          if (e.target === e.currentTarget) menu.current?.close();
        }}
      >
        <button
          className={styles.close}
          aria-label="Close menu"
          onClick={() => menu.current?.close()}
        >
          <Icon name="x" />
        </button>
        {navigation}
      </dialog>
      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <button
            className={styles.menuTrigger}
            aria-label="Open menu"
            onClick={() => menu.current?.showModal()}
          >
            <Icon name="menu" />
          </button>
          <p className={styles.breadcrumb}>
            <span>{venture.name}</span>
            <span>/</span>
            <span>Operate</span>
            <span>/</span>
            <span>
              {PAGE_LABELS.find(([suffix]) => pathname.endsWith(suffix))?.[1] ?? "Command"}
            </span>
          </p>
          <div className={styles.meta}>
            <span className={styles.date}>
              {finance ? (
                <span className={styles.period}>
                  Period: August 2026{" "}
                  <img src="/ui/finance/chevron.svg" width="10" height="10" alt="" />
                </span>
              ) : crm ? (
                <span className={styles.totals}>
                  Total Clients: <strong>87</strong>
                  <span aria-hidden="true">|</span>
                  Active: <strong className={styles.active}>64</strong>
                </span>
              ) : technology ? (
                <span className={styles.systemStatus}>
                  <img src="/ui/command/success.svg" width="6" height="6" alt="" />
                  Sample status: All systems operational
                </span>
              ) : operateGrowth ? (
                <span className={styles.growthRate}>Sample growth rate: +12% MoM</span>
              ) : growth || operations || schedule ? (
                "Fixed Figma fixture"
              ) : (
                "Thursday 4 Sep 2026"
              )}
            </span>
            <span className={styles.sample}>
              <img src="/ui/command/success.svg" width="6" height="6" alt="" />
              Sample data
            </span>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
