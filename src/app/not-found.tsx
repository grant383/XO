import type { Metadata } from "next";
import { AccountChrome } from "./_chrome/account-chrome";
import { NotFoundState } from "./_chrome/error-states";

export const metadata: Metadata = { title: "Page not found" };

/** Unmatched URLs and notFound() (Figma 31:3604). */
export default function NotFound() {
  return (
    <AccountChrome>
      <NotFoundState />
    </AccountChrome>
  );
}
