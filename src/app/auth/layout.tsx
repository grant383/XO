import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Minimal functional auth shell (P0 step 3). Figma styling lands with the app shell. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <main style={{ maxWidth: 420, margin: "48px auto", padding: "0 16px" }}>{children}</main>;
}
