"use client";

import Link from "next/link";
import { useId } from "react";
import { Avatar, Icon } from "@/ui";
import { logoutAction } from "../auth/actions";
import styles from "./app-shell.module.css";
import type { ShellUser } from "./types";
import { usePopover } from "./use-popover";

/**
 * Figma Component/Navigation/Account Control. Account-level only (54:24043 contract): it
 * never carries venture navigation: Profile & Security and sign-out.
 */
export function AccountMenu({
  user,
  context,
  compact,
}: {
  user: ShellUser;
  /** Second line under the name (the role in the current venture). */
  context: string;
  /** Mobile: a 40px avatar button only. */
  compact?: boolean;
}) {
  const { open, toggle, rootRef, triggerRef } = usePopover();
  const panelId = useId();
  return (
    <div className={styles.account} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={compact ? styles.accountCompact : styles.accountButton}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={compact ? `Account: ${user.name}` : undefined}
        onClick={toggle}
      >
        <Avatar name={user.name} size={compact ? 40 : 32} />
        {compact ? null : (
          <>
            <span className={styles.accountCopy}>
              <span className={styles.accountName}>{user.name}</span>
              <span className={styles.switcherContext}>{context}</span>
            </span>
            <Icon name="chevron-down-account" />
          </>
        )}
      </button>
      <div id={panelId} className={`${styles.popover} ${styles.popoverEnd}`} hidden={!open}>
        <p className={styles.popoverLabel}>Signed in as</p>
        <p className={styles.popoverEmail}>{user.email}</p>
        <Link href="/settings/profile-security" className={styles.popoverAction}>
          Profile &amp; Security
        </Link>
        <form action={logoutAction}>
          <button type="submit" className={styles.popoverAction}>
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
