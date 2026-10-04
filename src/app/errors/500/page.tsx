import type { Metadata } from "next";
import { ServerErrorState } from "../../_chrome/error-states";

export const metadata: Metadata = { title: "Something went wrong" };

/** Canonical 500 route (Figma 31:3692), e.g. for an edge or load-balancer error page. */
export default function ServerErrorPage() {
  return <ServerErrorState />;
}
