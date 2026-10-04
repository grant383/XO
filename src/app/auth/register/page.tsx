import type { Metadata, Route } from "next";
import { PASSWORD_POLICY, TOKEN_POLICY, safeNextPath, withNext } from "@/modules/identity";
import { Alert } from "@/ui";
import { registerAction } from "../actions";
import { AuthForm } from "../auth-form";
import { AuthHeading, FlowPath } from "../auth-parts";
import { AuthShell, STORIES } from "../auth-shell";
import { durationLabel } from "../duration";

export const metadata: Metadata = { title: "Create account" };

type Props = { searchParams: Promise<{ next?: string | string[] }> };

/** Figma 33:3202 (create account) → 33:3266 (check your inbox). */
export default async function RegisterPage({ searchParams }: Props) {
  // Carried through the verification email so an invitee returns to their invitation.
  const next = safeNextPath((await searchParams).next);
  return (
    <AuthShell story={STORIES.register}>
      <AuthHeading title="Create your account">
        Create a secure workspace for your business.
      </AuthHeading>
      {next?.startsWith("/invite/") ? (
        <Alert tone="info" title="Accepting an invitation">
          Use the email address your invitation was sent to.
        </Alert>
      ) : null}
      <AuthForm
        action={registerAction}
        submitLabel="Create account"
        pendingLabel="Creating account…"
        errorTitle="We couldn’t create your account"
        hidden={next ? { next } : undefined}
        success={{
          kind: "inbox",
          linkValidFor: durationLabel(TOKEN_POLICY.emailVerificationTtlSec),
        }}
        fields={[
          {
            name: "name",
            label: "Full name",
            type: "text",
            autoComplete: "name",
            placeholder: "Full name",
            maxLength: 120,
          },
          {
            name: "email",
            label: "Work email",
            type: "email",
            autoComplete: "email",
            placeholder: "you@company.com",
          },
          {
            name: "password",
            label: "Password",
            type: "password",
            autoComplete: "new-password",
            placeholder: "Enter a strong password",
            minLength: PASSWORD_POLICY.minLength,
            maxLength: PASSWORD_POLICY.maxLength,
            hint: `At least ${PASSWORD_POLICY.minLength} characters.`,
          },
        ]}
      />
      <FlowPath
        prompt="Already have an account?"
        href={withNext("/auth/login", next) as Route}
        label="Sign in"
      />
    </AuthShell>
  );
}
