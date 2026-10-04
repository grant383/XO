import type { Metadata } from "next";
import {
  getMfaStatus,
  getPasswordChangedAt,
  getProfile,
  listSessions,
  PASSWORD_POLICY,
  type MfaStatus,
} from "@/modules/identity";
import { Button, Icon, initialsOf, StatusBadge } from "@/ui";
import { PageContent, PageHeader } from "../../_shell/page-header";
import { logoutAction } from "../../auth/actions";
import { PasswordRequirements } from "../../auth/auth-parts";
import { identityHeaders, requireActor } from "../../actor";
import { describeDevice } from "./device";
import {
  MfaRow,
  PasswordRow,
  PersonalDetailsForm,
  RevokeOthersButton,
  RevokeSessionButton,
} from "./forms";
import styles from "./profile-security.module.css";

export const metadata: Metadata = { title: "Profile and security" };
export const dynamic = "force-dynamic";

const PATH = "/settings/profile-security";
const dateTime = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" });

function mfaDetail(mfa: MfaStatus) {
  if (!mfa.enabled) return "Not set up. Add an authenticator app as a second sign-in step.";
  if (mfa.recoveryCodesRemaining === null) return "Authenticator app enabled";
  const n = mfa.recoveryCodesRemaining;
  return `Authenticator app enabled · ${n} backup code${n === 1 ? "" : "s"} available`;
}

/**
 * Figma 33:3534. Account-level: everything here belongs to the signed-in user, resolved
 * from the session cookie on every request. No venture context is read or shown.
 */
export default async function ProfileSecurityPage() {
  await requireActor(PATH);
  const h = await identityHeaders();
  const [profile, mfa, sessions, passwordChangedAt] = await Promise.all([
    getProfile(h),
    getMfaStatus(h),
    listSessions(h),
    getPasswordChangedAt(h),
  ]);
  const others = sessions.filter((s) => !s.current).length;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Account" }, { label: "Profile & Security" }]}
        title="Profile & Security"
      >
        Manage personal details, authentication, and active sessions
      </PageHeader>
      <PageContent>
        <div className={styles.stack}>
          <PersonalDetailsForm
            name={profile.name}
            email={profile.email}
            avatar={
              <span className={styles.profileAvatar} aria-hidden="true">
                {initialsOf(profile.name)}
              </span>
            }
          />

          <section className={styles.card} aria-labelledby="authentication">
            <div className={styles.headingCopy}>
              <h2 id="authentication">Password &amp; authentication</h2>
              <p>Strong authentication keeps your strategic operating data private.</p>
            </div>
            <div>
              <PasswordRow
                detail={
                  passwordChangedAt
                    ? `Last changed ${date.format(passwordChangedAt)}`
                    : "Password sign-in"
                }
                requirements={<PasswordRequirements {...PASSWORD_POLICY} />}
              />
              <MfaRow enabled={mfa.enabled} detail={mfaDetail(mfa)} />
            </div>
          </section>

          <section className={styles.card} aria-labelledby="sessions">
            <div className={styles.cardHeading}>
              <div className={styles.headingCopy}>
                <h2 id="sessions">Active sessions</h2>
                <p>Devices currently signed in to your DirectorXO account.</p>
              </div>
              <RevokeOthersButton disabled={others === 0} />
            </div>
            <ul className={styles.sessions}>
              {sessions.map((s) => {
                const device = describeDevice(s.userAgent);
                const meta = [
                  `Signed in ${dateTime.format(s.createdAt)} UTC`,
                  s.current ? "Active now" : `Last active ${dateTime.format(s.lastActiveAt)} UTC`,
                  s.ipAddress ? `IP ${s.ipAddress}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li key={s.id} className={styles.session}>
                    <Icon name={device.kind === "mobile" ? "smartphone" : "laptop"} />
                    <div className={styles.sessionCopy}>
                      <p className={styles.sessionTitle}>
                        {device.label}
                        {s.current ? <StatusBadge tone="success">This device</StatusBadge> : null}
                      </p>
                      <p className={styles.sessionMeta}>{meta}</p>
                    </div>
                    {s.current ? (
                      <span className={styles.currentLabel}>Current session</span>
                    ) : (
                      <RevokeSessionButton sessionId={s.id} device={device.label} />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <div className={styles.leave}>
            <p>Need to leave this workspace?</p>
            <form action={logoutAction}>
              <Button type="submit" variant="danger">
                <Icon name="log-out" />
                Sign out of DirectorXO
              </Button>
            </form>
          </div>
        </div>
      </PageContent>
    </>
  );
}
