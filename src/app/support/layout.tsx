import type { ReactNode } from "react";
import { AccountShell } from "../_shell/account-shell";
export const metadata = { robots: { index: false, follow: false } };
export default function Layout({ children }: { children: ReactNode }) {
  return <AccountShell next="/support">{children}</AccountShell>;
}
