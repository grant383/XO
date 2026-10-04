import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Icon } from "@/ui";
import { AccountChrome } from "../_chrome/account-chrome";
import { requireActor } from "../actor";

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
    <AccountChrome
      name={actor.name}
      footer={
        <>
          <Icon name="lock-keyhole" />
          Progress is saved each time you continue to the next step.
        </>
      }
    >
      {children}
    </AccountChrome>
  );
}
