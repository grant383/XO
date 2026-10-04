"use client";

import { ServerErrorState } from "../../../_chrome/error-states";
import { PageContent } from "../../../_shell/page-header";

/** Errors inside a venture page keep the shell and venture context (Figma 31:3692). */
export default function ShellError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <PageContent>
      <ServerErrorState digest={error.digest} retry={retry} />
    </PageContent>
  );
}
