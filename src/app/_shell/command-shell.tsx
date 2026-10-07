"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";
import { Brand, Icon } from "@/ui";
import { AccountMenu } from "./account-menu";
import type { ShellUser, ShellVenture } from "./types";
import styles from "./command-shell.module.css";

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
    items: ["Command", "£1M Growth Command", "Finance", "Operations", "Growth", "Technology"],
  },
];

/** Node 8:651 has its own dense navigation; unshipped destinations remain truthful. */
export function CommandShell({
  venture,
  user,
  children,
}: {
  venture: ShellVenture;
  user: ShellUser;
  children: ReactNode;
}) {
  const menu = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const growth = pathname.endsWith("/command/growth-1m");
  const operateGrowth = pathname.endsWith("/operate/growth");
  const finance = pathname.endsWith("/operate/finance");
  const operations = pathname.endsWith("/operate/operations");
  const canOpenOperations = venture.operationsAllowed === true;
  const navigation = (
    <>
      <div className={styles.brand}>
        <Brand compact />
      </div>
      <div className={styles.navigation}>
        {sections.map((section) => (
          <nav key={section.label} aria-label={section.label}>
            <p className={styles.sectionLabel}>{section.label}</p>
            <ul>
              {section.items.map((item) => (
                <li key={item}>
                  {item === "Command" ||
                  item === "£1M Growth Command" ||
                  (item === "Growth" && venture.growthAllowed === true) ||
                  item === "Finance" ||
                  (section.label === "Operate" && item === "Operations" && canOpenOperations) ? (
                    <Link
                      href={
                        item === "£1M Growth Command"
                          ? `/v/${venture.id}/command/growth-1m`
                          : item === "Command"
                            ? `/v/${venture.id}/command`
                            : item === "Operations"
                              ? `/v/${venture.id}/operate/operations`
                              : item === "Finance"
                                ? `/v/${venture.id}/operate/finance`
                                : `/v/${venture.id}/operate/growth`
                      }
                      aria-current={
                        (
                          item === "£1M Growth Command"
                            ? growth
                            : item === "Operations"
                              ? operations
                              : item === "Finance"
                                ? finance
                                : item === "Growth"
                                  ? operateGrowth
                                  : !growth && !finance && !operations && !operateGrowth
                        )
                          ? "page"
                          : undefined
                      }
                      onClick={() => menu.current?.close()}
                    >
                      {item}
                    </Link>
                  ) : (
                    <span
                      aria-disabled="true"
                      title={
                        section.label === "Operate" && (item === "Operations" || item === "Growth")
                          ? "Operator access required"
                          : "Module not yet available"
                      }
                    >
                      {item}
                    </span>
                  )}
                </li>
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
              {operateGrowth
                ? "Growth"
                : operations
                  ? "Operations"
                  : finance
                    ? "Finance"
                    : growth
                      ? "£1M Growth Command"
                      : "Command"}
            </span>
          </p>
          <div className={styles.meta}>
            <span className={styles.date}>
              {finance ? (
                <span className={styles.period}>
                  Period: August 2026{" "}
                  <img src="/ui/finance/chevron.svg" width="10" height="10" alt="" />
                </span>
              ) : operateGrowth ? (
                <span className={styles.growthRate}>Sample growth rate: +12% MoM</span>
              ) : growth || operations ? (
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
