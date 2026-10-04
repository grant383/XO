import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Set up your venture",
  robots: { index: false, follow: false },
};

/** Minimal functional onboarding shell (P0 step 4). Figma styling lands with the app shell. */
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <main style={{ maxWidth: 640, margin: "48px auto", padding: "0 16px" }}>{children}</main>;
}
