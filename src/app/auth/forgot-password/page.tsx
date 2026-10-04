import type { Metadata } from "next";
import { TOKEN_POLICY } from "@/modules/identity";
import { forgotPasswordAction } from "../actions";
import { AuthForm } from "../auth-form";
import { AuthHeading, BackLink, SecurityNote } from "../auth-parts";
import { AuthShell, STORIES } from "../auth-shell";
import { durationLabel } from "../duration";

export const metadata: Metadata = { title: "Forgot password" };

/** Figma 31:3503. The response never reveals whether an account exists. */
export default function ForgotPasswordPage() {
  return (
    <AuthShell story={STORIES.recovery}>
      <BackLink href="/auth/login">Back to login</BackLink>
      <AuthHeading title="Reset your password">
        Enter the work email linked to your DirectorXO account. We’ll send a secure reset link that
        expires in {durationLabel(TOKEN_POLICY.passwordResetTtlSec)}.
      </AuthHeading>
      <AuthForm
        action={forgotPasswordAction}
        submitLabel="Send reset link"
        pendingLabel="Sending…"
        errorTitle="We couldn’t send the link"
        success={{ kind: "message", next: { href: "/auth/login", label: "Back to sign in" } }}
        fields={[
          {
            name: "email",
            label: "Work email",
            type: "email",
            autoComplete: "email",
            placeholder: "you@company.com",
          },
        ]}
        afterSubmit={
          <SecurityNote>
            For your security, we’ll never ask for your password by email.
          </SecurityNote>
        }
      />
    </AuthShell>
  );
}
