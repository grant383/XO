"use client";
import { useActionState } from "react";
import { Button } from "@/ui";
import { useOnline } from "@/ui/hooks/use-online";
import { markReadAction } from "./actions";
import styles from "./notifications.module.css";
export function ReadButton({
  id,
  through,
  disabled,
}: {
  id?: string;
  through: string;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState(markReadAction, { message: "" });
  const online = useOnline();
  return (
    <form action={action} className={styles.readForm}>
      <input type="hidden" name="through" value={through} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <Button type="submit" variant="secondary" loading={pending} disabled={disabled || !online}>
        {id ? (
          "Mark as read"
        ) : (
          <>
            <img src="/ui/notifications/check-check.svg" alt="" />
            Mark all as read
          </>
        )}
      </Button>
      {!online ? <p role="status">You are offline. Reconnect to update notifications.</p> : null}
      {state.message ? <p role="status">{state.message}</p> : null}
    </form>
  );
}
