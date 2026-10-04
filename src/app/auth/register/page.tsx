import type { Metadata } from "next";
import Link from "next/link";
import { PASSWORD_POLICY } from "@/modules/identity";
import { registerAction } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <>
      <h1>Create your DirectorXO account</h1>
      <AuthForm
        action={registerAction}
        submitLabel="Create account"
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
        Already have an account? <Link href="/auth/login">Sign in</Link>
      </p>
    </>
  );
}
