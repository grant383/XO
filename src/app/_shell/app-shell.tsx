"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { Brand, Icon } from "@/ui";
import { CommandShell } from "./command-shell";
import { AccountMenu } from "./account-menu";
import styles from "./app-shell.module.css";
import { CurrentPage, NavLink } from "./nav-link";
import { ACCOUNT_CONTEXT, type ShellNavSection, type ShellUser, type ShellVenture } from "./types";
import { VentureSwitcher } from "./venture-switcher";

type Props = {
  /** Null on account-level pages, which show no venture context. */
  venture: ShellVenture | null;
  ventures: ShellVenture[];
  user: ShellUser;
  nav: ShellNavSection[];
  children: ReactNode;
};

function Navigation({ venture, ventures, nav }: Omit<Props, "children" | "user">) {
  return (
    <>
      <div className={styles.brandArea}>
        <Brand compact />
      </div>
      <VentureSwitcher current={venture} ventures={ventures} />
      {nav.map((section) => (
        <nav key={section.label} className={styles.navSection} aria-label={section.label}>
          <p className={styles.navHeading}>{section.label}</p>
          <ul className={styles.navList}>
            {section.items.map((item) => (
              <li key={item.href}>
                <NavLink item={item} />
              </li>
            ))}
          </ul>
        </nav>
      ))}
    </>
  );
}

/**
 * Global application shell (Figma 54:24284–54:24286, behaviour 54:24043): a 248px sidebar
 * from 1024px, a 76px rail from 768px and a menu sheet below that, with a sticky 56px top
 * bar. The venture in context always comes from the route and the server; the shell only
 * presents what the server resolved.
 */
export function AppShell({ venture, ventures, user, nav, children }: Props) {
  const sheetRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  // Close the mobile sheet after navigation.
  useEffect(() => {
    if (sheetRef.current?.open) sheetRef.current.close();
  }, [pathname]);

  if (
    venture &&
    (pathname === `/v/${venture.id}/command` ||
      pathname.startsWith(`/v/${venture.id}/command/`) ||
      pathname === `/v/${venture.id}/operate/finance` ||
      pathname === `/v/${venture.id}/operate/operations` ||
      pathname === `/v/${venture.id}/operate/growth`)
  ) {
    return (
      <CommandShell venture={venture} ventures={ventures} user={user} nav={nav}>
        {children}
      </CommandShell>
    );
  }

  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skipLink}>
        Skip to content
      </a>
      <aside
        className={styles.sidebar}
        aria-label={venture ? "Venture navigation" : "Account navigation"}
      >
        <Navigation venture={venture} ventures={ventures} nav={nav} />
      </aside>

      <dialog
        ref={sheetRef}
        className={styles.sheet}
        aria-label="Menu"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <div className={styles.sheetBody}>
          <button
            type="button"
            className={styles.sheetClose}
            aria-label="Close menu"
            onClick={() => sheetRef.current?.close()}
          >
            <Icon name="x" />
          </button>
          <Navigation venture={venture} ventures={ventures} nav={nav} />
        </div>
      </dialog>

      <div className={styles.workspace}>
        <header className={styles.topBar}>
          <button
            type="button"
            className={styles.menuTrigger}
            aria-label="Open menu"
            onClick={() => sheetRef.current?.showModal()}
          >
            <Icon name="menu" />
          </button>
          <p className={styles.context}>
            <span className={styles.contextVenture}>{venture?.name ?? ACCOUNT_CONTEXT}</span>
            <span className={styles.contextDivider} aria-hidden="true">
              /
            </span>
            <CurrentPage sections={nav} withSection={venture !== null} />
          </p>
          <div className={styles.accountWide}>
            <AccountMenu user={user} context={venture?.roleLabel ?? ACCOUNT_CONTEXT} />
          </div>
          <div className={styles.accountNarrow}>
            <AccountMenu user={user} context={venture?.roleLabel ?? ACCOUNT_CONTEXT} compact />
          </div>
        </header>
        <main id="main" className={styles.main} tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
