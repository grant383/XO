"use client";
import { useActionState, useId } from "react";
import { Button } from "@/ui";
import { useOnline } from "@/ui/hooks/use-online";
import { openBillingAction, type BillingActionState } from "./actions";
export function BillingButton({
  accountId,
  requestId,
  action,
  disabled,
  children,
}: {
  accountId: string;
  requestId: string;
  action: "checkout" | "portal";
  disabled?: boolean;
  children: string;
}) {
  const [state, submit, pending] = useActionState(openBillingAction, {
    message: "",
  } as BillingActionState);
  const online = useOnline();
  const statusId = useId();
  return (
    <form action={submit}>
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="requestId" value={requestId} />
      <Button
        type="submit"
        variant={action === "checkout" ? "primary" : "secondary"}
        loading={pending}
        disabled={disabled || !online}
        aria-describedby={state.message ? statusId : undefined}
      >
        {children}
      </Button>
      {!online ? <p role="status">You are offline. Reconnect to manage billing.</p> : null}
      {state.message ? (
        <p role="status" id={statusId}>
          {state.message}
        </p>
      ) : null}
      {state.url ? (
        <a href={state.url} rel="noreferrer">
          Continue to secure Stripe billing
        </a>
      ) : null}
    </form>
  );
}
