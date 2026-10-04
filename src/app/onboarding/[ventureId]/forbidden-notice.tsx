import Link from "next/link";

/** Shown to venture members who are not the Owner (P0 error pages arrive in step 10). */
export function ForbiddenNotice() {
  return (
    <>
      <h1>You do not have permission to set up this venture</h1>
      <p>Only the venture Owner can complete onboarding.</p>
      <Link href="/">Go to home</Link>
    </>
  );
}
