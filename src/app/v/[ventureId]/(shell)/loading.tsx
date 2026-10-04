import { LoadingState } from "@/ui";
import { PageContent } from "../../../_shell/page-header";

/** Application loading state (Figma 54:27792) while the page resolves server-side. */
export default function ShellLoading() {
  return (
    <PageContent>
      <LoadingState
        title="Loading"
        description="Checking your access and fetching the latest venture data."
        status="Loading…"
      />
    </PageContent>
  );
}
