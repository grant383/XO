"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Button, ButtonLink, ErrorSummary, TextField } from "@/ui";
import styles from "./auth.module.css";
import { CheckInbox } from "./check-inbox";
import { idle, type FormState } from "./form-state";

export type FieldSpec = {
  name: string;
  label: string;
  type: "text" | "email" | "password";
  autoComplete: string;
  placeholder?: string;
  hint?: string;
  minLength?: number;
  maxLength?: number;
};

type Props = {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  fields: FieldSpec[];
  submitLabel: string;
  pendingLabel?: string;
  hidden?: Record<string, string>;
  /** Title of the error summary shown when the action fails. */
  errorTitle?: string;
  /** Rendered between the fields and the submit button (e.g. recovery link, requirements). */
  beforeSubmit?: ReactNode;
  /** Rendered after the submit button (e.g. security note). */
  afterSubmit?: ReactNode;
  /** Success presentation: a message with an optional next step, or the "check your inbox" state. */
  success?:
    | { kind: "message"; next?: { href: string; label: string } }
    | { kind: "inbox"; linkValidFor: string };
};

/** Remounting on "change email" returns the form to a clean, empty state. */
export function AuthForm(props: Props) {
  const [attempt, setAttempt] = useState(0);
  return <AuthFormBody key={attempt} {...props} onRestart={() => setAttempt((n) => n + 1)} />;
}

/**
 * Auth form over a server action (Figma auth panel). The server action stays authoritative:
 * native constraints are a convenience; every rule is re-validated server-side.
 */
function AuthFormBody({
  action,
  fields,
  submitLabel,
  pendingLabel = "Please wait…",
  hidden,
  errorTitle = "We couldn’t complete that",
  beforeSubmit,
  afterSubmit,
  success = { kind: "message" },
  onRestart,
}: Props & { onRestart: () => void }) {
  const [state, formAction, pending] = useActionState(action, idle);
  const summaryRef = useRef<HTMLDivElement>(null);

  // Move focus to the error summary after a failed submit (WCAG 3.3.1).
  useEffect(() => {
    if (state.status === "error") summaryRef.current?.focus();
  }, [state]);

  if (state.status === "success") {
    if (success.kind === "inbox") {
      return (
        <CheckInbox
          email={state.email}
          linkValidFor={success.linkValidFor}
          onChangeEmail={onRestart}
        />
      );
    }
    return (
      <div className={styles.form}>
        <Alert tone="success" title={state.message} />
        {success.next ? (
          <ButtonLink href={success.next.href} block>
            {success.next.label}
          </ButtonLink>
        ) : null}
      </div>
    );
  }

  const fieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;
  return (
    <form action={formAction} className={styles.form}>
      {state.status === "error" ? (
        <ErrorSummary
          ref={summaryRef}
          id="form-error"
          title={errorTitle}
          detail={hasFieldErrors ? undefined : state.message}
          fieldErrors={hasFieldErrors ? fieldErrors : undefined}
        />
      ) : null}
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {fields.length > 0 ? (
        <div className={styles.fields}>
          {fields.map((f) => (
            <TextField
              key={f.name}
              name={f.name}
              label={f.label}
              type={f.type}
              autoComplete={f.autoComplete}
              placeholder={f.placeholder}
              hint={f.hint}
              error={fieldErrors[f.name]}
              required
              minLength={f.minLength}
              maxLength={f.maxLength}
            />
          ))}
        </div>
      ) : null}
      {beforeSubmit}
      <Button type="submit" block loading={pending} loadingLabel={pendingLabel}>
        {submitLabel}
      </Button>
      {afterSubmit}
    </form>
  );
}
