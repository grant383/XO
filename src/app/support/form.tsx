"use client";
import { useActionState } from "react";
import { useOnline } from "@/ui/hooks/use-online";
import { Button, TextField } from "@/ui";
import { submitSupportAction } from "./actions";
import styles from "./support.module.css";

export function SupportForm({ requestId }: { requestId: string }) {
  const online = useOnline();
  const [state, action, pending] = useActionState(submitSupportAction, { ok: false, message: "" });
  return (
    <form action={action} className={styles.form}>
      <h2>Create support request</h2>
      {!online ? (
        <p role="status">You are offline. Reconnect to submit a support request.</p>
      ) : null}
      <p>Please avoid passwords, access tokens, card details or sensitive financial data.</p>
      <input type="hidden" name="requestId" value={requestId} />
      <TextField
        name="subject"
        label="Subject"
        required
        maxLength={200}
        disabled={pending || state.ok || !online}
      />
      <label htmlFor="description">Description</label>
      <textarea
        id="description"
        name="description"
        required
        minLength={10}
        maxLength={5000}
        rows={5}
        disabled={pending || state.ok || !online}
      />
      {state.message ? <p role={state.ok ? "status" : "alert"}>{state.message}</p> : null}
      <Button type="submit" loading={pending} disabled={state.ok || !online}>
        Submit request
      </Button>
    </form>
  );
}
