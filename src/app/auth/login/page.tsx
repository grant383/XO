import type { Metadata, Route } from "next";
import Link from "next/link";
import { safeNextPath, withNext } from "@/modules/identity";
import { loginAction } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in" };

type Props = { searchParams: Promise<{ next?: string | string[] }> };

export default async function LoginPage({ searchParams }: Props) {
  // A validated return path (e.g. a pending invitation) survives sign-in.
  const next = safeNextPath((await searchParams).next);
  return (
    <>
      <h1>Sign in to DirectorXO</h1>
      <AuthForm
        action={loginAction}
        submitLabel="Sign in"
        hidden={next ? { next } : undefined}
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
        New to DirectorXO?{" "}
        <Link href={withNext("/auth/register", next) as Route}>Create an account</Link>
      </p>
    </>
  );
}
