import type { Metadata, Route } from "next";
import Link from "next/link";
import { PASSWORD_POLICY, safeNextPath, withNext } from "@/modules/identity";
import { registerAction } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create account" };

type Props = { searchParams: Promise<{ next?: string | string[] }> };

export default async function RegisterPage({ searchParams }: Props) {
  // Carried through the verification email so an invitee returns to their invitation.
  const next = safeNextPath((await searchParams).next);
  return (
    <>
      <h1>Create your DirectorXO account</h1>
      {next?.startsWith("/invite/") ? (
        <p>Use the email address your invitation was sent to.</p>
      ) : null}
      <AuthForm
        action={registerAction}
        submitLabel="Create account"
        hidden={next ? { next } : undefined}
        fields={[
          { name: "name", label: "Full name", type: "text", autoComplete: "name", maxLength: 120 },
          { name: "email", label: "Email address", type: "email", autoComplete: "email" },
          {
            name: "password",
            label: "Password",
            type: "password",
            autoComplete: "new-password",
            minLength: PASSWORD_POLICY.minLength,
            maxLength: PASSWORD_POLICY.maxLength,
            hint: `At least ${PASSWORD_POLICY.minLength} characters.`,
          },
        ]}
      />
      <p>
        Already have an account? <Link href={withNext("/auth/login", next) as Route}>Sign in</Link>
      </p>
    </>
  );
}
