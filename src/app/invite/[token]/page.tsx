import type { Metadata, Route } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { getSession, withNext } from "@/modules/identity";
import {
  invitationPath,
  isWellFormedInvitationToken,
  previewInvitation,
} from "@/modules/memberships";
import { ROLE_LABELS } from "@/modules/ventures";
import { Alert, Button, ButtonLink, Icon, StatusBadge, type IconName } from "@/ui";
import { AuthShell, STORIES } from "../../auth/auth-shell";
import { acceptInvitationAction, switchAccountAction } from "./actions";
import { AcceptInvitationForm } from "./accept-form";
import styles from "./invite.module.css";

// The URL carries a single-use token: never send it in a Referer header.
export const metadata: Metadata = {
  title: "Team invitation",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "UTC",
});

function expiryText(expiresAt: Date): string {
  const hours = Math.floor((expiresAt.getTime() - Date.now()) / 3_600_000);
  if (hours < 1) return "Invitation expires in less than an hour";
  if (hours < 48) return `Invitation expires in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  return `Invitation expires on ${dateFormat.format(expiresAt)} UTC`;
}

function Heading({
  icon,
  tone,
  badge,
  title,
  children,
}: {
  icon: IconName;
  tone?: "warning";
  badge?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className={styles.heading}>
      <span className={styles.stateIcon} data-tone={tone} aria-hidden="true">
        <Icon name={icon} />
      </span>
      {badge}
      <h1>{title}</h1>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <AuthShell story={STORIES.invite}>
      <div className={styles.card}>{children}</div>
    </AuthShell>
  );
}

function Problem({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel>
      <Heading icon="triangle-alert" tone="warning" title={title}>
        {children}
      </Heading>
      <ButtonLink href="/" variant="secondary" block>
        Go to DirectorXO
      </ButtonLink>
    </Panel>
  );
}

/**
 * Accept team invitation (Figma 54:27078, spec §12 P0). Nothing about the invitation is
 * shown until the holder signs in as the invited address; acceptance is an explicit POST.
 */
export default async function InvitationPage({ params }: Props) {
  const { token } = await params;
  if (!isWellFormedInvitationToken(token)) {
    return (
      <Problem title="Invitation not valid">
        This invitation link is invalid or incomplete. Check that you copied the whole link.
      </Problem>
    );
  }

  const session = await getSession(await headers());
  if (!session) {
    const next = invitationPath(token);
    return (
      <Panel>
        <Heading icon="user-plus" title="You’ve been invited to DirectorXO">
          Sign in, or create an account with the email address this invitation was sent to. The
          invitation details appear once you are signed in.
        </Heading>
        <div className={styles.actions}>
          <ButtonLink href={withNext("/auth/login", next) as Route} block>
            Sign in to continue
            <Icon name="arrow-right" />
          </ButtonLink>
          <ButtonLink href={withNext("/auth/register", next) as Route} variant="secondary" block>
            Create an account
          </ButtonLink>
        </div>
      </Panel>
    );
  }

  const preview = await previewInvitation({ userId: session.userId }, token);
  switch (preview.state) {
    case "valid":
      return (
        <Panel>
          <Heading
            icon="user-plus"
            badge={<StatusBadge tone="success">Invitation verified</StatusBadge>}
            title="You’ve been invited to join a team"
          >
            {preview.inviterName ?? "A venture administrator"} invited you to collaborate in
            DirectorXO.
          </Heading>
          <dl className={styles.details}>
            {preview.inviterName ? (
              <div className={styles.detail}>
                <dt>Invited by</dt>
                <dd>{preview.inviterName}</dd>
              </div>
            ) : null}
            <div className={styles.detail}>
              <dt>Venture</dt>
              <dd>{preview.ventureName}</dd>
            </div>
            <div className={styles.detail}>
              <dt>Assigned role</dt>
              <dd data-tone="role">{ROLE_LABELS[preview.role]}</dd>
            </div>
            <div className={styles.detail}>
              <dt>Email identity</dt>
              <dd>{session.email}</dd>
            </div>
          </dl>
          <Alert tone="info" title={expiryText(preview.expiresAt)}>
            Only accept if you recognise the inviter and venture. This single-use link is bound to{" "}
            {session.email}.
          </Alert>
          <AcceptInvitationForm action={acceptInvitationAction.bind(null, token)} />
          <p className={styles.note}>
            Wrong email or unexpected invitation? Don’t continue. Contact the person who invited
            you.
          </p>
        </Panel>
      );
    case "already_member":
      return (
        <Panel>
          <Heading icon="user-plus" title="You are already a member">
            You already belong to {preview.ventureName}.
          </Heading>
          <ButtonLink href={`/v/${preview.ventureId}/command`} block>
            Go to {preview.ventureName}
            <Icon name="arrow-right" />
          </ButtonLink>
        </Panel>
      );
    case "wrong_account":
      return (
        <Panel>
          <Heading
            icon="triangle-alert"
            tone="warning"
            title="This invitation is for a different account"
          >
            You are signed in as {session.email}. Sign in with the email address the invitation was
            sent to.
          </Heading>
          <form action={switchAccountAction.bind(null, token)}>
            <Button type="submit" block>
              Sign out and switch account
            </Button>
          </form>
        </Panel>
      );
    case "expired":
      return (
        <Problem title="Invitation expired">
          Ask the person who invited you to send a new invitation.
        </Problem>
      );
    case "suspended":
      return (
        <Problem title="Access suspended">
          Your access to this venture is suspended. Contact a venture administrator.
        </Problem>
      );
    default:
      return (
        <Problem title="Invitation not valid">
          This invitation is invalid, has been revoked or has already been used.
        </Problem>
      );
  }
}
