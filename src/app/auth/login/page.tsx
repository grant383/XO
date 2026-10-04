import type { Metadata } from "next";
import Link from "next/link";
import { loginAction } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <>
      <h1>Sign in to DirectorXO</h1>
      <AuthForm
        action={loginAction}
        submitLabel="Sign in"
        fields={[
          { name: "email", label: "Email address", type: "email", autoComplete: "email" },
          {
            name: "password",
            label: "Password",
            type: "password",
            autoComplete: "current-password",
          },
        ]}
      />
      <p>
        <Link href="/auth/forgot-password">Forgot your password?</Link>
      </p>
      <p>
        New to DirectorXO? <Link href="/auth/register">Create an account</Link>
      </p>
    </>
  );
}
