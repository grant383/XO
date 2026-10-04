"use client";

import type { Route } from "next";
import Link from "next/link";
import { useActionState } from "react";
import { idle, type FormState } from "./form-state";

export type FieldSpec = {
  name: string;
  label: string;
  type: "text" | "email" | "password";
  autoComplete: string;
  hint?: string;
  minLength?: number;
  maxLength?: number;
};

type Props = {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  fields: FieldSpec[];
  submitLabel: string;
  hidden?: Record<string, string>;
  /** Shown with the success message (e.g. a link to sign in, built by `withNext`). */
  next?: { href: string; label: string };
};

/** Minimal accessible P0 form. Visual design follows the approved Figma in a later step. */
export function AuthForm({ action, fields, submitLabel, hidden, next }: Props) {
  const [state, formAction, pending] = useActionState(action, idle);

  if (state.status === "success") {
    return (
      <div role="status" aria-live="polite">
        <p>{state.message}</p>
        {next ? <Link href={next.href as Route}>{next.label}</Link> : null}
      </div>
    );
  }

  const fieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={formAction} noValidate={false}>
      {state.status === "error" ? (
        <p role="alert" id="form-error">
          {state.message}
        </p>
      ) : null}
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {fields.map((f) => {
        const error = fieldErrors[f.name];
        const describedBy = [f.hint ? `${f.name}-hint` : "", error ? `${f.name}-error` : ""]
          .filter(Boolean)
          .join(" ");
        return (
          <p key={f.name}>
            <label htmlFor={f.name}>{f.label}</label>
            <br />
            <input
              id={f.name}
              name={f.name}
              type={f.type}
              autoComplete={f.autoComplete}
              required
              minLength={f.minLength}
              maxLength={f.maxLength}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy || undefined}
            />
            {f.hint ? <small id={`${f.name}-hint`}>{f.hint}</small> : null}
            {error ? (
              <small id={`${f.name}-error`} role="alert">
                {error}
              </small>
            ) : null}
          </p>
        );
      })}
      <button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Please wait…" : submitLabel}
      </button>
    </form>
  );
}
