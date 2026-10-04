"use client";

import { useActionState } from "react";
import type { AcceptState } from "./actions";

/** Minimal accessible P0 form. Visual design follows the approved Figma in a later step. */
export function AcceptInvitationForm({
  action,
}: {
  action: (prev: AcceptState) => Promise<AcceptState>;
}) {
  const [state, formAction, pending] = useActionState<AcceptState>(action, { status: "idle" });
  return (
    <form action={formAction}>
      {state.status === "error" ? <p role="alert">{state.message}</p> : null}
      <button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Joining…" : "Accept invitation"}
      </button>
    </form>
  );
}
