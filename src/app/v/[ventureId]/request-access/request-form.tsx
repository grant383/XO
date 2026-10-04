"use client";

import { useActionState } from "react";
import type { RequestAccessState } from "./actions";

export function RequestAccessForm({
  action,
}: {
  action: (prev: RequestAccessState) => Promise<RequestAccessState>;
}) {
  const [state, formAction, pending] = useActionState<RequestAccessState>(action, {
    status: "idle",
  });
  if (state.status === "sent") {
    return (
      <div role="status" aria-live="polite">
        <p>
          Request sent. If this link belongs to a DirectorXO venture, its administrators can review
          your request. Once approved, the venture appears on your home page.
        </p>
      </div>
    );
  }
  return (
    <form action={formAction}>
      <button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Sending…" : "Request access"}
      </button>
    </form>
  );
}
