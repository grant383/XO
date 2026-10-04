"use client";

import { fontVariables } from "@/ui/fonts";
import "@/ui/global.css";
import { AccountChrome } from "./_chrome/account-chrome";
import { ServerErrorState } from "./_chrome/error-states";

/** Errors in the root layout itself: renders its own document (Figma 31:3692). */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en-GB" className={fontVariables}>
      <body>
        <title>Something went wrong · DirectorXO</title>
        <AccountChrome>
          <ServerErrorState digest={error.digest} retry={retry} />
        </AccountChrome>
      </body>
    </html>
  );
}
