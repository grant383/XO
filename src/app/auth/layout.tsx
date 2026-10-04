import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Each auth page renders its own `AuthShell` so the product story can vary per flow. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return children;
}
