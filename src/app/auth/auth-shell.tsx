import type { ReactNode } from "react";
import { Brand, Eyebrow, StatusBadge } from "@/ui";
import styles from "./auth-shell.module.css";

export type Story = {
  eyebrow: string;
  title: string;
  lede: string;
};

/**
 * Trust metrics shown beside every auth form. They describe controls that exist
 * (TLS, server-side sessions with lockout, role-based venture access) — never sample data.
 */
const TRUST_METRICS: Array<{ label: string; value: string; tone?: "success" }> = [
  { label: "Encryption", value: "TLS in transit" },
  { label: "Auth", value: "Secure", tone: "success" },
  { label: "Access", value: "Role-based" },
];

/** Split authentication layout (Figma 31:3441 and siblings): product story + auth panel. */
export function AuthShell({ story, children }: { story: Story; children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <aside className={styles.story} aria-label="About DirectorXO">
        <Brand />
        <div className={styles.message}>
          <Eyebrow>{story.eyebrow}</Eyebrow>
          <p className={styles.display}>{story.title}</p>
          <p className={styles.lede}>{story.lede}</p>
          <span className={styles.signal} aria-hidden="true" />
        </div>
        <dl className={styles.metrics}>
          {TRUST_METRICS.map((m) => (
            <div key={m.label} className={styles.metric}>
              <dt>{m.label}</dt>
              <dd data-tone={m.tone}>{m.value}</dd>
            </div>
          ))}
        </dl>
      </aside>
      <main className={styles.panel}>
        <div className={styles.utility}>
          <span className={styles.panelBrand}>
            <Brand compact />
          </span>
          <StatusBadge tone="success">Secure session</StatusBadge>
        </div>
        <div className={styles.content}>{children}</div>
        <p className={styles.footer}>DirectorXO · Strategic operating system for business owners</p>
      </main>
    </div>
  );
}

export const STORIES = {
  signIn: {
    eyebrow: "Business command · Secure access",
    title: "Secure access to DirectorXO.",
    lede: "Sign in to continue to your workspace.",
  },
  register: {
    eyebrow: "Founder access · Start your command",
    title: "Build the business with clarity.",
    lede: "Create your private workspace and turn goals, financials, priorities, and operating signals into one decisive plan.",
  },
  recovery: {
    eyebrow: "Account recovery",
    title: "A clear path back to command.",
    lede: "Restore access securely without interrupting the work already in motion across your business.",
  },
  reset: {
    eyebrow: "Account recovery · Secure reset",
    title: "Return to command securely.",
    lede: "Choose a strong new password without interrupting the work already in motion across your business.",
  },
  invite: {
    eyebrow: "Team invitation · Verified access",
    title: "Join a venture with confidence.",
    lede: "Confirm who invited you, the role you have been assigned, and the identity that will be used before joining a private DirectorXO workspace.",
  },
  verify: {
    eyebrow: "Identity check · One last step",
    title: "Secure the command seat.",
    lede: "Confirm your work email so only authorised people can access your ventures and their operating data.",
  },
} satisfies Record<string, Story>;
