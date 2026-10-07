import { LoadingState } from "@/ui";
import { AccountChrome } from "../../../_chrome/account-chrome";

/** Application loading state (Figma 54:27792) while access is checked server-side. */
export default function RequestAccessLoading() {
  return (
    <AccountChrome>
      <LoadingState title="Loading" status="Loading…" />
    </AccountChrome>
  );
}
