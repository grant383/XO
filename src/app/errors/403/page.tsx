import type { Metadata } from "next";
import { ForbiddenState } from "../../_chrome/error-states";

export const metadata: Metadata = { title: "Access denied" };

/** Canonical 403 route (Figma 33:4456). Discloses no resource, venture or role. */
export default function ForbiddenPage() {
  return <ForbiddenState />;
}
