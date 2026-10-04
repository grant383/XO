"use client";

import { useActionState, type ReactNode } from "react";
import { idleTeamState, type TeamFormState } from "./form-state";

type Action = (prev: TeamFormState, data: FormData) => Promise<TeamFormState>;
type Option = { value: string; label: string };

function Status({ state, id }: { state: TeamFormState; id?: string }) {
  if (state.status === "idle") return null;
  return state.status === "error" ? (
    <p role="alert" id={id}>
      {state.message}
    </p>
  ) : (
    <p role="status" aria-live="polite" id={id}>
      {state.message}
    </p>
  );
}

/** Invite a member by email with a role the actor may assign. */
export function InviteForm({ action, roles }: { action: Action; roles: Option[] }) {
  const [state, formAction, pending] = useActionState(action, idleTeamState);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const values = state.status === "error" ? state.values : undefined;
  return (
    <form action={formAction} key={state.status === "success" ? state.message : "invite"}>
      <Status state={state} />
      <p>
        <label htmlFor="invite-email">Email address</label>
        <br />
        <input
          id="invite-email"
          name="email"
          type="email"
          required
          maxLength={320}
          autoComplete="off"
          defaultValue={values?.email}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "invite-email-error" : undefined}
        />
        {errors.email ? (
          <small id="invite-email-error" role="alert">
            {errors.email}
          </small>
        ) : null}
      </p>
      <p>
        <label htmlFor="invite-role">Role</label>
        <br />
        <select
          id="invite-role"
          name="role"
          required
          defaultValue={values?.role ?? roles.at(-1)?.value}
          aria-invalid={errors.role ? true : undefined}
          aria-describedby={errors.role ? "invite-role-error" : undefined}
        >
          {roles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        {errors.role ? (
          <small id="invite-role-error" role="alert">
            {errors.role}
          </small>
        ) : null}
      </p>
      <button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Sending…" : "Send invitation"}
      </button>
    </form>
  );
}

/**
 * A small row-level form (revoke, change role, suspend, approve...). Hidden inputs carry
 * references only; the server re-authorises everything.
 */
export function RowActionForm({
  action,
  hidden,
  label,
  pendingLabel,
  children,
}: {
  action: Action;
  hidden: Record<string, string>;
  label: string;
  pendingLabel: string;
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, idleTeamState);
  return (
    <form action={formAction} style={{ display: "inline-block", marginRight: 8 }}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? pendingLabel : label}
      </button>
      <Status state={state} />
    </form>
  );
}

/** Role select used inside a RowActionForm. */
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
    <>
      <label htmlFor={id} style={{ position: "absolute", left: -10000 }}>
        {label}
      </label>
      <select id={id} name="role" defaultValue={defaultValue}>
        {roles.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>{" "}
    </>
  );
}
