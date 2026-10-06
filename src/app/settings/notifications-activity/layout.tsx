import type { ReactNode } from "react";
import { AccountShell } from "../../_shell/account-shell";
export default function Layout({ children }: { children: ReactNode }) {
  return <AccountShell next="/settings/notifications-activity">{children}</AccountShell>;
}
