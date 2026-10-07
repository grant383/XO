import { LoadingState } from "@/ui";
import { AccountChrome } from "./_chrome/account-chrome";

/**
 * Application loading state (Figma 54:27792) for routes without a closer boundary: the
 * entry redirect and the auth pages that check sessions or challenges server-side.
 */
export default function RootLoading() {
  return (
    <AccountChrome>
      <LoadingState title="Loading DirectorXO" status="Loading…" />
    </AccountChrome>
  );
}
