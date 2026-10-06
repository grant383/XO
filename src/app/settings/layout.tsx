import type { Metadata } from "next";
import type { ReactNode } from "react";
export const metadata: Metadata = { robots: { index: false, follow: false } };
/** Each settings module has its own authenticated AccountShell layout and canonical return path. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return children;
}
