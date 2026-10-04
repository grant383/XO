import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Avatar, Brand, Icon } from "@/ui";
import { requireActor } from "../actor";
import styles from "./onboarding.module.css";

export const metadata: Metadata = {
  title: "Set up your venture",
  robots: { index: false, follow: false },
};

/**
 * Onboarding chrome (Figma 33:3378 and siblings): brand, the signed-in account and a
 * centred setup card. Each page still authenticates and authorises on its own.
 */
export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  const actor = await requireActor();
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Brand />
        <div className={styles.account}>
          <Avatar name={actor.name} />
          <span className={styles.accountName}>{actor.name}</span>
        </div>
      </header>
      <main className={styles.body}>
        {children}
        <p className={styles.footer}>
          <Icon name="lock-keyhole" />
          Progress is saved each time you continue to the next step.
        </p>
      </main>
    </div>
  );
}
