import type { Metadata, Route } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { getSession, withNext } from "@/modules/identity";
import {
  invitationPath,
  isWellFormedInvitationToken,
  previewInvitation,
} from "@/modules/memberships";
import { ROLE_LABELS } from "@/modules/ventures";
import { acceptInvitationAction, switchAccountAction } from "./actions";
import { AcceptInvitationForm } from "./accept-form";

// The URL carries a single-use token: never send it in a Referer header.
export const metadata: Metadata = {
  title: "Team invitation",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

function Shell({ children }: { children: React.ReactNode }) {
  return <main style={{ maxWidth: 520, margin: "48px auto", padding: "0 16px" }}>{children}</main>;
}

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" });

/**
 * Accept team invitation (spec §12 P0). Nothing about the invitation is shown until the
 * holder signs in as the invited address; acceptance is an explicit POST.
 */
export default async function InvitationPage({ params }: Props) {
  const { token } = await params;
  if (!isWellFormedInvitationToken(token)) {
    return (
      <Shell>
        <h1>Invitation not valid</h1>
        <p>This invitation link is invalid or incomplete. Check that you copied the whole link.</p>
        <Link href="/">Go to DirectorXO</Link>
      </Shell>
    );
  }

  const session = await getSession(await headers());
  if (!session) {
    const next = invitationPath(token);
    return (
      <Shell>
        <h1>You have been invited to DirectorXO</h1>
        <p>Sign in, or create an account with the email address this invitation was sent to.</p>
        <p>
          <Link href={withNext("/auth/login", next) as Route}>Sign in</Link>
        </p>
        <p>
          <Link href={withNext("/auth/register", next) as Route}>Create an account</Link>
        </p>
      </Shell>
    );
  }

  const preview = await previewInvitation({ userId: session.userId }, token);
  switch (preview.state) {
    case "valid":
      return (
        <Shell>
          <h1>Join {preview.ventureName}</h1>
          <p>
            {preview.inviterName ?? "A venture administrator"} invited you to join{" "}
            <strong>{preview.ventureName}</strong> as {ROLE_LABELS[preview.role]}.
          </p>
          <p>
            Signed in as {session.email}. This invitation expires on{" "}
            {dateFormat.format(preview.expiresAt)}.
          </p>
          <AcceptInvitationForm action={acceptInvitationAction.bind(null, token)} />
        </Shell>
      );
    case "already_member":
      return (
        <Shell>
          <h1>You are already a member</h1>
          <p>You already belong to {preview.ventureName}.</p>
          <Link href="/">Go to your ventures</Link>
        </Shell>
      );
    case "wrong_account":
      return (
        <Shell>
          <h1>This invitation is for a different account</h1>
          <p>
            You are signed in as {session.email}. Sign in with the email address the invitation was
            sent to.
          </p>
          <form action={switchAccountAction.bind(null, token)}>
            <button type="submit">Sign out and switch account</button>
          </form>
        </Shell>
      );
    case "expired":
      return (
        <Shell>
          <h1>Invitation expired</h1>
          <p>Ask the person who invited you to send a new invitation.</p>
          <Link href="/">Go to DirectorXO</Link>
        </Shell>
      );
    case "suspended":
      return (
        <Shell>
          <h1>Access suspended</h1>
          <p>Your access to this venture is suspended. Contact a venture administrator.</p>
          <Link href="/">Go to DirectorXO</Link>
        </Shell>
      );
    default:
      return (
        <Shell>
          <h1>Invitation not valid</h1>
          <p>This invitation is invalid, has been revoked or has already been used.</p>
          <Link href="/">Go to DirectorXO</Link>
        </Shell>
      );
  }
}
