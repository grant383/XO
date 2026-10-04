import type { Metadata } from "next";
import { Alert, ButtonLink, Icon, StatusBadge } from "@/ui";
import { AuthHeading, StateIcon, authStyles } from "../../auth-parts";
import { AuthShell, STORIES } from "../../auth-shell";
import styles from "../../mfa/mfa.module.css";

export const metadata: Metadata = { title: "Password reset" };

/**
 * Figma 54:27280. Public and static: reached after a successful reset, it reveals nothing
 * about the token or the account. A reset always revokes every session (ADR-0009).
 */
export default function ResetPasswordSuccessPage() {
  return (
    <AuthShell story={STORIES.resetComplete}>
      <div className={authStyles.form}>
        <StateIcon name="badge-check" tone="success" />
        <div className={styles.badgeRow}>
          <StatusBadge tone="success">Password updated</StatusBadge>
        </div>
        <AuthHeading title="Password reset successful" centered>
          Your new password is active. Use it the next time you sign in to DirectorXO.
        </AuthHeading>
        <Alert tone="success" title="All other sessions signed out">
          Existing browser and device sessions were revoked to protect your account.
        </Alert>
        <div className={styles.box}>
          <p className={styles.boxTitle}>Before you continue</p>
          <p className={styles.boxBody}>
            After signing in, review your signed-in devices in Profile &amp; Security. If you did
            not request this reset, turn on two-step verification there.
          </p>
        </div>
        <ButtonLink href="/auth/login" block>
          Return to login
          <Icon name="arrow-right-button" />
        </ButtonLink>
      </div>
    </AuthShell>
  );
}
