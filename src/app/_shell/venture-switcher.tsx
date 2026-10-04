"use client";

import type { Route } from "next";
import Link from "next/link";
import { useId } from "react";
import { Avatar, cx, Icon } from "@/ui";
import styles from "./app-shell.module.css";
import type { ShellVenture } from "./types";
import { usePopover } from "./use-popover";

/**
 * Figma Component/Navigation/Venture Switcher. Lists the ventures the server returned
 * (`listSwitchableVentures`, active memberships only); choosing one navigates to that
 * venture's route, where the server re-authorises it. Nothing is selected client-side.
 */
export function VentureSwitcher({
  current,
  ventures,
}: {
  /** Null on account-level pages: the switcher then only offers the user's ventures. */
  current: ShellVenture | null;
  ventures: ShellVenture[];
}) {
  const { open, toggle, rootRef, triggerRef } = usePopover();
  const panelId = useId();
  return (
    <div className={styles.switcher} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.switcherButton}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={
          current ? `Current venture: ${current.name}. Switch venture` : "Choose a venture"
        }
        onClick={toggle}
      >
        {current ? (
          <Avatar name={current.name} size={32} shape="square" />
        ) : (
          <span className={styles.switcherPlaceholder} aria-hidden="true">
            <Icon name="building-2-sm" />
          </span>
        )}
        <span className={styles.switcherCopy}>
          <span className={styles.switcherName}>{current ? current.name : "Your ventures"}</span>
          <span className={styles.switcherContext}>
            {current ? current.roleLabel : "Choose a venture"}
          </span>
        </span>
        <Icon name="chevrons-up-down" className={styles.switcherChevron} />
      </button>
      <div id={panelId} className={styles.popover} hidden={!open}>
        <p className={styles.popoverLabel}>Your ventures</p>
        <ul className={styles.popoverList}>
          {ventures.map((v) => (
            <li key={v.id}>
              <Link
                href={`/v/${v.id}` as Route}
                className={cx(
                  styles.popoverItem,
                  v.id === current?.id && styles.popoverItemCurrent,
                )}
                aria-current={v.id === current?.id ? "page" : undefined}
              >
                <Avatar name={v.name} size={24} shape="square" />
                <span className={styles.popoverItemCopy}>
                  <span>{v.name}</span>
                  <span className={styles.switcherContext}>{v.roleLabel}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/onboarding" className={styles.popoverAction}>
          <Icon name="plus" />
          Set up a new venture
        </Link>
      </div>
    </div>
  );
}
