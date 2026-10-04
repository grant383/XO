"use client";

import { AccountChrome } from "./_chrome/account-chrome";
import { ServerErrorState } from "./_chrome/error-states";

/** Unexpected errors below the root layout (Figma 31:3692). */
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <AccountChrome>
      <title>Something went wrong · DirectorXO</title>
      <ServerErrorState digest={error.digest} retry={retry} />
    </AccountChrome>
  );
}
