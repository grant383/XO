import type { ReactNode } from "react";
import { Avatar, Brand } from "@/ui";
import styles from "./account-chrome.module.css";

/**
 * Account-level page chrome (Figma onboarding header): used where no venture is selected,
 * such as onboarding and the request-access flow, so no venture context is shown.
 */
export function AccountChrome({
  name,
  footer,
  children,
}: {
  /** Signed-in account name; omitted on public pages. */
  name?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Brand />
        {name ? (
          <div className={styles.account}>
            <Avatar name={name} />
            <span className={styles.accountName}>{name}</span>
          </div>
        ) : null}
      </header>
      <main className={styles.body}>
        {children}
        {footer ? <p className={styles.footer}>{footer}</p> : null}
      </main>
    </div>
  );
}
