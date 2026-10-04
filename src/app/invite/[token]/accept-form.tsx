"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button, ErrorSummary, Icon } from "@/ui";
import type { AcceptState } from "./actions";
import styles from "./invite.module.css";

/** Explicit POST only: the single-use token is never consumed on page load. */
export function AcceptInvitationForm({
  action,
}: {
  action: (prev: AcceptState) => Promise<AcceptState>;
}) {
  const [state, formAction, pending] = useActionState<AcceptState>(action, { status: "idle" });
  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status === "error") summaryRef.current?.focus();
  }, [state]);
  return (
    <form action={formAction} className={styles.actions}>
      {state.status === "error" ? (
        <ErrorSummary
          ref={summaryRef}
          title="We couldn’t accept this invitation"
          detail={state.message}
        />
      ) : null}
      <Button type="submit" block loading={pending} loadingLabel="Joining…">
        Accept invitation and continue
        <Icon name="arrow-right" />
      </Button>
    </form>
  );
}
