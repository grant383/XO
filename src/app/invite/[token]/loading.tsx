import { LoadingState } from "@/ui";
import { AccountChrome } from "../../_chrome/account-chrome";

/** Application loading state (Figma 54:27792) while the invitation is checked server-side. */
export default function InvitationLoading() {
  return (
    <AccountChrome>
      <LoadingState title="Loading invitation" status="Loading…" />
    </AccountChrome>
  );
}
