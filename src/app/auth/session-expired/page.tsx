import type { Metadata, Route } from "next";
import Link from "next/link";
import { safeNextPath, SESSION_POLICY, withNext } from "@/modules/identity";
import { Alert, ButtonLink, Icon } from "@/ui";
import { AuthHeading, StateIcon, authStyles } from "../auth-parts";
import { AuthShell, STORIES } from "../auth-shell";
import { durationLabel } from "../duration";
import styles from "../mfa/mfa.module.css";

export const metadata: Metadata = { title: "Session expired" };

type Props = { searchParams: Promise<{ next?: string | string[] }> };

/**
 * Figma 54:27222. Public. Shown when a request arrives with a session cookie whose session
 * has ended (idle or absolute expiry, or revoked from another device). Sessions are
 * database-backed with no refresh-token API (ADR-0009): the only way on is to sign in.
 */
export default async function SessionExpiredPage({ searchParams }: Props) {
  const next = safeNextPath((await searchParams).next);
  return (
    <AuthShell story={STORIES.sessionExpired}>
      <div className={authStyles.form}>
        <StateIcon name="clock-3-lg" tone="warning" />
        <AuthHeading title="Your session has expired" centered>
          You were signed out to protect your account. Sessions end after{" "}
          {durationLabel(SESSION_POLICY.idleTimeoutSec)} without activity,{" "}
          {durationLabel(SESSION_POLICY.absoluteLifetimeSec)} after sign-in, or when signed out from
          another device. Nothing was changed after your session ended.
        </AuthHeading>
        {next ? (
          <div className={styles.box}>
            <p className={styles.boxEyebrow}>Return destination saved</p>
            <p className={styles.boxTitle}>The page you asked for will reopen after sign-in.</p>
          </div>
        ) : null}
        <ButtonLink href={withNext("/auth/login", next) as Route} block>
          Return to login
          <Icon name="arrow-right-button" />
        </ButtonLink>
        <Alert tone="warning" title="Didn’t expect to be signed out?">
          Close this browser and{" "}
          <Link href="/auth/forgot-password" className={styles.inlineLink}>
            reset your password
          </Link>{" "}
          if you suspect someone else used your account.
        </Alert>
      </div>
    </AuthShell>
  );
}
