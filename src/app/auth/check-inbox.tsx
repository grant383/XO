"use client";

import { useActionState } from "react";
import { Alert, Button, ErrorSummary } from "@/ui";
import { resendVerificationAction } from "./actions";
import { AuthHeading, InfoBox, SecurityNote, StateIcon, authStyles as styles } from "./auth-parts";
import { idle } from "./form-state";

type Props = { email?: string; linkValidFor: string; onChangeEmail: () => void };

/**
 * "Check your inbox" state after registration (Figma 33:3266). The address shown is the one
 * the user typed; the response is identical whether or not an account already existed.
 */
export function CheckInbox({ email, linkValidFor, onChangeEmail }: Props) {
  const [state, resend, pending] = useActionState(resendVerificationAction, idle);
  return (
    <div className={styles.form}>
      <StateIcon name="mail-check" />
      <AuthHeading title="Check your inbox" centered>
        {email ? "We sent a verification link to" : "We sent you a verification link."}
      </AuthHeading>
      {email ? <p className={styles.email}>{email}</p> : null}
      <InfoBox icon="clock-3" title={`Link valid for ${linkValidFor}`}>
        Open the link in the email to verify your account. DirectorXO will never ask you to send a
        password or verification code by email.
      </InfoBox>
      {state.status === "success" ? <Alert tone="success" title={state.message} /> : null}
      {state.status === "error" ? (
        <ErrorSummary title="We couldn’t resend the email" detail={state.message} />
      ) : null}
      {email ? (
        <form action={resend}>
          <input type="hidden" name="email" value={email} />
          <Button type="submit" block loading={pending} loadingLabel="Sending…">
            Resend verification email
          </Button>
        </form>
      ) : null}
      <p className={styles.path}>
        <span>Wrong address?</span>
        <button type="button" className={styles.pathButton} onClick={onChangeEmail}>
          Change email
        </button>
      </p>
      <SecurityNote>Verification protects your business data and team access.</SecurityNote>
    </div>
  );
}
