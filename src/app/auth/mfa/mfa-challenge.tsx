"use client";

import type { Route } from "next";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Alert, Button, Icon, TextField } from "@/ui";
import { verifyMfaAction } from "../actions";
import { AuthHeading, StateIcon, authStyles } from "../auth-parts";
import { idle, type FormState } from "../form-state";
import { CodeInput } from "./code-input";
import styles from "./mfa.module.css";

type Mode = "totp" | "recovery";

type Props = { next: string | null; digits: number; periodSec: number };

const COPY: Record<Mode, { title: string; lede: string; toggle: string }> = {
  totp: {
    title: "Enter your authenticator code",
    lede: "Enter the 6-digit code from the authenticator app linked to your DirectorXO account.",
    toggle: "Use a backup code",
  },
  recovery: {
    title: "Use a backup code",
    lede: "Enter one of the backup codes you saved when you turned on two-step verification. Each code works once.",
    toggle: "Use your authenticator app",
  },
};

function errorCopy(
  state: Extract<FormState, { status: "error" }>,
  mode: Mode,
  next: string | null,
) {
  const signIn = (next ? `/auth/login?next=${encodeURIComponent(next)}` : "/auth/login") as Route;
  switch (state.code) {
    case "MFA_CHALLENGE_EXPIRED":
      return {
        title: "This sign-in attempt has ended",
        body: (
          <>
            For your security, codes can only be entered for a short time.{" "}
            <Link href={signIn} className={styles.inlineLink}>
              Sign in again
            </Link>{" "}
            to continue.
          </>
        ),
      };
    case "MFA_LOCKED":
    case "RATE_LIMITED":
      return { title: "Too many attempts", body: state.message };
    case "INVALID_CODE":
    case "VALIDATION":
      return {
        title: "That code didn’t work",
        body:
          mode === "totp"
            ? "Enter the current code from your authenticator app. Codes refresh every 30 seconds."
            : "Check the code and try again. Each backup code works once.",
      };
    default:
      return { title: "We couldn’t verify that code", body: state.message };
  }
}

/** Seconds until the current authenticator code changes (clock-based, display only). */
function useCodeCountdown(periodSec: number) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(periodSec - (Math.floor(Date.now() / 1000) % periodSec));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [periodSec]);
  return left;
}

/**
 * MFA challenge (Figma 54:27145): authenticator code, or a single-use backup code. The
 * server action is authoritative; nothing here decides whether the code is valid.
 */
export function MfaChallenge({ next, digits, periodSec }: Props) {
  const [mode, setMode] = useState<Mode>("totp");
  const [state, formAction, pending] = useActionState(verifyMfaAction, idle);
  // An error belongs to the attempt that produced it: switching method dismisses it.
  const [dismissed, setDismissed] = useState<FormState | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const left = useCodeCountdown(periodSec);
  const failed = state.status === "error" && state !== dismissed ? state : null;

  useEffect(() => {
    if (state.status === "error") alertRef.current?.focus();
  }, [state]);

  const error = failed ? errorCopy(failed, mode, next) : null;
  const copy = COPY[mode];
  return (
    <form action={formAction} className={authStyles.form} key={mode}>
      <div className={styles.heading}>
        <StateIcon name="shield-check-lg" />
        <AuthHeading title={copy.title} centered>
          {copy.lede}
        </AuthHeading>
      </div>
      <input type="hidden" name="method" value={mode} />
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {mode === "totp" ? (
        <CodeInput
          name="code"
          label="Authentication code"
          length={digits}
          invalid={Boolean(error)}
          describedBy={error ? "mfa-error" : undefined}
        />
      ) : (
        <TextField
          name="code"
          label="Backup code"
          autoComplete="one-time-code"
          placeholder="abcde-12345"
          spellCheck={false}
          autoCapitalize="none"
          required
          maxLength={32}
          aria-describedby={error ? "mfa-error" : undefined}
        />
      )}

      {error ? (
        <div ref={alertRef} tabIndex={-1} className={styles.alertFocus} id="mfa-error">
          <Alert tone="error" title={error.title}>
            {error.body}
          </Alert>
        </div>
      ) : null}

      {mode === "totp" ? (
        <p className={styles.countdown} aria-hidden="true">
          {left === null ? " " : `New code in ${left}s`}
        </p>
      ) : null}

      <Button type="submit" block loading={pending} loadingLabel="Verifying…">
        Verify and continue
        <Icon name="arrow-right-button" />
      </Button>

      <div className={styles.actions}>
        <Button
          variant="tertiary"
          onClick={() => {
            setDismissed(state);
            setMode(mode === "totp" ? "recovery" : "totp");
          }}
        >
          {copy.toggle}
        </Button>
        <Link
          href={(next ? `/auth/login?next=${encodeURIComponent(next)}` : "/auth/login") as Route}
          className={authStyles.textLink}
        >
          Back to sign in
        </Link>
      </div>
      <p className={styles.notice}>
        Never share an authenticator or backup code. DirectorXO support will not ask for one.
      </p>
    </form>
  );
}
