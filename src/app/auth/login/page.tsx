import type { Metadata, Route } from "next";
import Link from "next/link";
import { safeNextPath, withNext } from "@/modules/identity";
import { loginAction } from "../actions";
import { AuthForm } from "../auth-form";
import { AuthHeading, FlowPath, SecurityNote, authStyles } from "../auth-parts";
import { AuthShell, STORIES } from "../auth-shell";

export const metadata: Metadata = { title: "Sign in" };

type Props = { searchParams: Promise<{ next?: string | string[] }> };

/** Figma 31:3441 (sign in) and 31:3549 (failed sign-in state, rendered inline). */
export default async function LoginPage({ searchParams }: Props) {
  // A validated return path (e.g. a pending invitation) survives sign-in.
  const next = safeNextPath((await searchParams).next);
  return (
    <AuthShell story={STORIES.signIn}>
      <AuthHeading title="Welcome back">Sign in to continue to DirectorXO.</AuthHeading>
      <AuthForm
        action={loginAction}
        submitLabel="Sign in"
        pendingLabel="Signing in…"
        errorTitle="We couldn’t sign you in"
        hidden={next ? { next } : undefined}
        fields={[
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
            autoComplete: "current-password",
            placeholder: "Enter your password",
          },
        ]}
        beforeSubmit={
          <div className={authStyles.row}>
            <Link href="/auth/forgot-password" className={authStyles.textLink}>
              Forgot password?
            </Link>
          </div>
        }
        afterSubmit={
          <SecurityNote>
            Encrypted in transit. We temporarily pause sign-in after repeated failed attempts.
          </SecurityNote>
        }
      />
      <FlowPath
        prompt="New to DirectorXO?"
        href={withNext("/auth/register", next) as Route}
        label="Create an account"
      />
    </AuthShell>
  );
}
