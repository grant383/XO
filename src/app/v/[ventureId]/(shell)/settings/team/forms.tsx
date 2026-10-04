"use client";

import { useActionState, useEffect, useId, useRef, type ReactNode } from "react";
import { Alert, Button, ErrorSummary, SelectField, TextField, type ButtonVariant } from "@/ui";
import { idleTeamState, type TeamFormState } from "./form-state";
import styles from "./team.module.css";

type Action = (prev: TeamFormState, data: FormData) => Promise<TeamFormState>;
type Option = { value: string; label: string };

/** Invite a member by email with a role the actor may assign. */
export function InviteForm({ action, roles }: { action: Action; roles: Option[] }) {
  const [state, formAction, pending] = useActionState(action, idleTeamState);
  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status === "error") summaryRef.current?.focus();
  }, [state]);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const values = state.status === "error" ? state.values : undefined;
  const hasFieldErrors = Object.keys(errors).length > 0;
  return (
    <form
      action={formAction}
      className={styles.inviteForm}
      key={state.status === "success" ? state.message : "invite"}
    >
      {state.status === "error" ? (
        <ErrorSummary
          ref={summaryRef}
          title="We couldn’t send the invitation"
          detail={hasFieldErrors ? undefined : state.message}
          fieldErrors={
            hasFieldErrors
              ? Object.fromEntries(Object.entries(errors).map(([k, v]) => [`invite-${k}`, v]))
              : undefined
          }
        />
      ) : null}
      {state.status === "success" ? <Alert tone="success" title={state.message} /> : null}
      <div className={styles.inviteFields}>
        <TextField
          id="invite-email"
          name="email"
          label="Email address"
          type="email"
          required
          maxLength={320}
          autoComplete="off"
          defaultValue={values?.email}
          error={errors.email}
        />
        <SelectField
          id="invite-role"
          name="role"
          label="Role"
          required
          options={roles}
          defaultValue={values?.role ?? roles.at(-1)?.value}
          error={errors.role}
        />
        <Button type="submit" loading={pending} loadingLabel="Sending…">
          Send invitation
        </Button>
      </div>
    </form>
  );
}

/**
 * A row-level form (revoke, change role, suspend, approve...). Hidden inputs carry
 * references only; the server re-authorises everything.
 */
export function RowActionForm({
  action,
  hidden,
  label,
  pendingLabel,
  variant = "secondary",
  children,
}: {
  action: Action;
  hidden: Record<string, string>;
  label: ReactNode;
  pendingLabel: string;
  variant?: ButtonVariant;
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, idleTeamState);
  return (
    <form action={formAction} className={styles.rowForm}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className={styles.rowControls}>
        {children}
        <Button type="submit" variant={variant} loading={pending} loadingLabel={pendingLabel}>
          {label}
        </Button>
      </div>
      {state.status === "error" ? (
        <p role="alert" className={styles.rowError}>
          {state.message}
        </p>
      ) : state.status === "success" ? (
        <p role="status" className={styles.rowSuccess}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/** Role select used inside a RowActionForm; the label is visually hidden. */
export function RoleSelect({
  id,
  label,
  roles,
  defaultValue,
}: {
  id: string;
  label: string;
  roles: Option[];
  defaultValue?: string;
}) {
  return (
    <span className={styles.roleSelect}>
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
      <select id={id} name="role" defaultValue={defaultValue}>
        {roles.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
    </span>
  );
}

/**
 * Figma "Manage" button: a disclosure revealing the member's role and status actions.
 * Escape closes it and returns focus to the button.
 */
export function ManageMenu({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const panelId = useId();
  return (
    <details
      ref={ref}
      className={styles.manage}
      onKeyDown={(e) => {
        if (e.key === "Escape" && ref.current?.open) {
          ref.current.open = false;
          ref.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary className={styles.manageButton} aria-controls={panelId}>
        Manage<span className="visually-hidden"> {label}</span>
      </summary>
      <div id={panelId} className={styles.managePanel}>
        {children}
      </div>
    </details>
  );
}
