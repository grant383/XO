import type { Route } from "next";
import Link from "next/link";

/**
 * Shown for a venture the user cannot access. Identical whether the venture exists or not
 * (no enumeration); offers the permission-denied request-access flow (spec §12).
 */
export function NoVentureAccess({ ventureId }: { ventureId: string }) {
  return (
    <main style={{ maxWidth: 640, margin: "48px auto", padding: "0 16px" }}>
      <h1>You do not have access to this venture</h1>
      <p>
        If someone shared this link with you, you can ask the venture&apos;s administrators for
        access.
      </p>
      <p>
        <Link href={`/v/${ventureId}/request-access` as Route}>Request access</Link>
      </p>
      <Link href="/">Go to home</Link>
    </main>
  );
}
