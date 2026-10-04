import type { Metadata } from "next";
import Link from "next/link";
import { PASSWORD_POLICY } from "@/modules/identity";
import { resetPasswordAction } from "../actions";
import { AuthForm } from "../auth-form";

// The URL carries a single-use token: never send it in a Referer header.
export const metadata: Metadata = { title: "Set new password", referrer: "no-referrer" };

type Props = { searchParams: Promise<{ token?: string | string[] }> };

/** The token is consumed only when the form is submitted (POST), never on page load. */
export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token } = await searchParams;
  if (typeof token !== "string" || token.length === 0) {
    return (
      <>
        <h1>Link not valid</h1>
        <p>This reset link is invalid or incomplete.</p>
        <Link href="/auth/forgot-password">Request a new link</Link>
      </>
    );
  }
  return (
    <>
      <h1>Set a new password</h1>
      <p>Setting a new password signs you out on every device.</p>
      <AuthForm
        action={resetPasswordAction}
        submitLabel="Set new password"
        hidden={{ token }}
        next={{ href: "/auth/login", label: "Sign in" }}
        fields={[
          {
            name: "newPassword",
            label: "New password",
            type: "password",
            autoComplete: "new-password",
            minLength: PASSWORD_POLICY.minLength,
            maxLength: PASSWORD_POLICY.maxLength,
            hint: `At least ${PASSWORD_POLICY.minLength} characters.`,
          },
        ]}
      />
    </>
  );
}
