import type { Metadata } from "next";
import { PASSWORD_POLICY } from "@/modules/identity";
import { ButtonLink } from "@/ui";
import { resetPasswordAction } from "../actions";
import { AuthForm } from "../auth-form";
import { AuthHeading, BackLink, PasswordRequirements, SecurityNote } from "../auth-parts";
import { AuthShell, STORIES } from "../auth-shell";

// The URL carries a single-use token: never send it in a Referer header.
export const metadata: Metadata = { title: "Set new password", referrer: "no-referrer" };

type Props = { searchParams: Promise<{ token?: string | string[] }> };

/** Figma 33:3315. The token is consumed only when the form is submitted (POST), never on load. */
export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token } = await searchParams;
  if (typeof token !== "string" || token.length === 0) {
    return (
      <AuthShell story={STORIES.reset}>
        <AuthHeading title="Link not valid">This reset link is invalid or incomplete.</AuthHeading>
        <ButtonLink href="/auth/forgot-password" block>
          Request a new link
        </ButtonLink>
      </AuthShell>
    );
  }
  return (
    <AuthShell story={STORIES.reset}>
      <BackLink href="/auth/login">Return to login</BackLink>
      <AuthHeading title="Set a new password">
        This password will replace the one previously used for your DirectorXO account.
      </AuthHeading>
      <AuthForm
        action={resetPasswordAction}
        submitLabel="Save new password"
        pendingLabel="Saving…"
        errorTitle="We couldn’t reset your password"
        hidden={{ token }}
        success={{ kind: "message", next: { href: "/auth/login", label: "Sign in" } }}
        fields={[
          {
            name: "newPassword",
            label: "New password",
            type: "password",
            autoComplete: "new-password",
            placeholder: "Enter new password",
            minLength: PASSWORD_POLICY.minLength,
            maxLength: PASSWORD_POLICY.maxLength,
          },
          {
            name: "confirmPassword",
            label: "Confirm password",
            type: "password",
            autoComplete: "new-password",
            placeholder: "Re-enter new password",
            maxLength: PASSWORD_POLICY.maxLength,
          },
        ]}
        beforeSubmit={<PasswordRequirements {...PASSWORD_POLICY} />}
        afterSubmit={
          <SecurityNote>All your active sessions will be signed out after you save.</SecurityNote>
        }
      />
    </AuthShell>
  );
}
