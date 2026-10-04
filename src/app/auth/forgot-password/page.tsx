import type { Metadata } from "next";
import Link from "next/link";
import { forgotPasswordAction } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1>Reset your password</h1>
      <p>Enter your email address and we will send you a link to reset your password.</p>
      <AuthForm
        action={forgotPasswordAction}
        submitLabel="Send reset link"
        fields={[{ name: "email", label: "Email address", type: "email", autoComplete: "email" }]}
      />
      <p>
        <Link href="/auth/login">Back to sign in</Link>
      </p>
    </>
  );
}
