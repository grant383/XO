import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AccountChrome } from "../_chrome/account-chrome";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Public error routes (spec §5 `/errors/*`): no session or venture context is shown. */
export default function ErrorsLayout({ children }: { children: ReactNode }) {
  return <AccountChrome>{children}</AccountChrome>;
}
