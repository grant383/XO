"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert, Button, ButtonLink, Icon, StatusBadge } from "@/ui";
import type { RequestAccessState } from "./actions";
import styles from "./request-access.module.css";

/**
 * Request form (Figma 54:27340) and submitted state (54:27489). The outcome is identical
 * whether or not the venture exists, so nothing here names a venture, approver or status.
 */
export function RequestAccessForm({
  action,
  email,
}: {
  action: (prev: RequestAccessState) => Promise<RequestAccessState>;
  email: string;
}) {
  const [state, formAction, pending] = useActionState<RequestAccessState>(action, {
    status: "idle",
  });
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (state.status === "sent") headingRef.current?.focus();
  }, [state]);

  if (state.status === "sent") {
    return (
      <section className={`${styles.card} ${styles.submitted}`} aria-labelledby="sent-heading">
        <span className={styles.sendTile} aria-hidden="true">
          <Icon name="send-horizontal" />
        </span>
        <StatusBadge tone="info">Request sent</StatusBadge>
        <h1 id="sent-heading" ref={headingRef} tabIndex={-1}>
          Your request has been sent
        </h1>
        <p className={styles.copy}>
          If this link belongs to a DirectorXO venture, its administrators can review your request.
          Once approved, the venture appears in your workspace.
        </p>
        <div className={styles.alert}>
          <Alert tone="success" title="No access has changed yet">
            You get access only when an administrator approves your request and chooses your role.
          </Alert>
        </div>
        <ButtonLink href="/">
          Go to DirectorXO
          <Icon name="arrow-right" />
        </ButtonLink>
      </section>
    );
  }

  return (
    <section className={styles.card} aria-labelledby="request-heading">
      <div className={styles.head}>
        <span className={styles.keyTile} aria-hidden="true">
          <Icon name="key-round" />
        </span>
        <div className={styles.headCopy}>
          <div className={styles.titleRow}>
            <h1 id="request-heading">Request access</h1>
            <StatusBadge tone="warning">Review required</StatusBadge>
          </div>
          <p className={styles.copy}>
            You do not have access to this venture. Ask its administrators to add your account.
          </p>
        </div>
      </div>
      <dl className={styles.details}>
        <div className={styles.detail}>
          <dt>Your account</dt>
          <dd>{email}</dd>
        </div>
        <div className={styles.detail}>
          <dt>Role</dt>
          <dd>Chosen by the reviewer</dd>
        </div>
      </dl>
      <form action={formAction} className={styles.form}>
        <Alert tone="info" title="What reviewers see">
          Your name and email address. Venture details are shown only after you are approved.
        </Alert>
        <div className={styles.actions}>
          <ButtonLink href="/" variant="secondary">
            Cancel
          </ButtonLink>
          <Button type="submit" loading={pending} loadingLabel="Sending…">
            Submit access request
            <Icon name="arrow-right" />
          </Button>
        </div>
      </form>
    </section>
  );
}
