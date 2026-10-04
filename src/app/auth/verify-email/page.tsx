import type { Metadata } from "next";
import { safeNextPath, withNext } from "@/modules/identity";
import { ButtonLink } from "@/ui";
import { verifyEmailAction } from "../actions";
import { AuthForm } from "../auth-form";
import { AuthHeading, SecurityNote, StateIcon } from "../auth-parts";
import { AuthShell, STORIES } from "../auth-shell";

// The URL carries a single-use token: never send it in a Referer header.
export const metadata: Metadata = { title: "Verify email", referrer: "no-referrer" };

type Props = { searchParams: Promise<{ token?: string | string[]; next?: string | string[] }> };

/**
 * Verification link landing (Figma 33:3266 visual). Verification happens on an explicit button
 * press (POST), not on page load, so email scanners that pre-fetch links cannot consume the token.
 */
export default async function VerifyEmailPage({ searchParams }: Props) {
  const { token, next } = await searchParams;
  if (typeof token !== "string" || token.length === 0) {
    return (
      <AuthShell story={STORIES.verify}>
        <StateIcon name="mail-check" />
        <AuthHeading title="Link not valid" centered>
          This verification link is invalid or incomplete. Sign in to receive a new one.
        </AuthHeading>
        <ButtonLink href="/auth/login" block>
          Sign in
        </ButtonLink>
      </AuthShell>
    );
  }
  return (
    <AuthShell story={STORIES.verify}>
      <StateIcon name="mail-check" />
      <AuthHeading title="Verify your email address" centered>
        Confirm this address to finish setting up your DirectorXO account.
      </AuthHeading>
      <AuthForm
        action={verifyEmailAction}
        submitLabel="Verify email address"
        pendingLabel="Verifying…"
        errorTitle="We couldn’t verify your email"
        hidden={{ token }}
        success={{
          kind: "message",
          next: { href: withNext("/auth/login", safeNextPath(next)), label: "Sign in" },
        }}
        fields={[]}
        afterSubmit={
          <SecurityNote>Verification protects your business data and team access.</SecurityNote>
        }
      />
    </AuthShell>
  );
}
