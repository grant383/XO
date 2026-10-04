import type { Metadata } from "next";
import Link from "next/link";
import { verifyEmailAction } from "../actions";
import { AuthForm } from "../auth-form";

// The URL carries a single-use token: never send it in a Referer header.
export const metadata: Metadata = { title: "Verify email", referrer: "no-referrer" };

type Props = { searchParams: Promise<{ token?: string | string[] }> };

/**
 * Verification happens on an explicit button press (POST), not on page load, so email
 * security scanners that pre-fetch links cannot consume the single-use token.
 */
export default async function VerifyEmailPage({ searchParams }: Props) {
  const { token } = await searchParams;
  if (typeof token !== "string" || token.length === 0) {
    return (
      <>
        <h1>Link not valid</h1>
        <p>This verification link is invalid or incomplete. Sign in to receive a new one.</p>
        <Link href="/auth/login">Sign in</Link>
      </>
    );
  }
  return (
    <>
      <h1>Verify your email address</h1>
      <AuthForm
        action={verifyEmailAction}
        submitLabel="Verify email address"
        hidden={{ token }}
        next={{ href: "/auth/login", label: "Sign in" }}
        fields={[]}
      />
    </>
  );
}
