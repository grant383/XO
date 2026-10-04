import { emailLayout, escapeHtml, type EmailMessage } from "@/platform/email";

const layout = emailLayout;

/** Page that consumes the token on an explicit POST, so link scanners cannot burn it. */
export const verifyEmailUrl = (appUrl: string, token: string, next?: string | null) =>
  `${appUrl}/auth/verify-email?token=${encodeURIComponent(token)}${next ? `&next=${encodeURIComponent(next)}` : ""}`;
export const resetPasswordUrl = (appUrl: string, token: string) =>
  `${appUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;

export function verificationEmail(
  to: { name: string; email: string },
  url: string,
  ttlHours: number,
): EmailMessage {
  const name = escapeHtml(to.name);
  return {
    to: to.email,
    category: "auth.verify-email",
    subject: "Verify your DirectorXO email address",
    text: `Hi ${to.name},\n\nConfirm your email address to finish creating your DirectorXO account:\n\n${url}\n\nThis link expires in ${ttlHours} hours and can be used once. If you did not create an account, you can ignore this email.`,
    html: layout(
      "Verify your email address",
      [
        `Hi ${name},`,
        "Confirm your email address to finish creating your DirectorXO account.",
        `This link expires in ${ttlHours} hours and can be used once. If you did not create an account, you can ignore this email.`,
      ],
      { label: "Verify email address", url },
    ),
  };
}

export function passwordResetEmail(
  to: { name: string; email: string },
  url: string,
  ttlMinutes: number,
): EmailMessage {
  const name = escapeHtml(to.name);
  return {
    to: to.email,
    category: "auth.reset-password",
    subject: "Reset your DirectorXO password",
    text: `Hi ${to.name},\n\nWe received a request to reset your DirectorXO password:\n\n${url}\n\nThis link expires in ${ttlMinutes} minutes and can be used once. Resetting your password signs you out on every device. If you did not request this, you can ignore this email.`,
    html: layout(
      "Reset your password",
      [
        `Hi ${name},`,
        "We received a request to reset your DirectorXO password.",
        `This link expires in ${ttlMinutes} minutes and can be used once. Resetting your password signs you out on every device. If you did not request this, you can ignore this email.`,
      ],
      { label: "Reset password", url },
    ),
  };
}

/** Sent instead of an error when someone registers with an existing address (no enumeration). */
export function existingAccountEmail(
  to: { name: string; email: string },
  loginUrl: string,
  resetUrl: string,
): EmailMessage {
  const name = escapeHtml(to.name);
  return {
    to: to.email,
    category: "auth.existing-account",
    subject: "You already have a DirectorXO account",
    text: `Hi ${to.name},\n\nSomeone tried to create a DirectorXO account with this email address, which already has an account.\n\nSign in: ${loginUrl}\nForgot your password? ${resetUrl}\n\nIf this was not you, no action is needed.`,
    html: layout("You already have an account", [
      `Hi ${name},`,
      "Someone tried to create a DirectorXO account with this email address, which already has an account.",
      `<a href="${escapeHtml(loginUrl)}">Sign in</a> or <a href="${escapeHtml(resetUrl)}">reset your password</a>.`,
      "If this was not you, no action is needed.",
    ]),
  };
}

export function passwordChangedEmail(
  to: { name: string; email: string },
  resetUrl: string,
): EmailMessage {
  const name = escapeHtml(to.name);
  return {
    to: to.email,
    category: "auth.password-changed",
    subject: "Your DirectorXO password was changed",
    text: `Hi ${to.name},\n\nYour DirectorXO password was just changed and all other sessions were signed out.\n\nIf this was not you, reset your password immediately: ${resetUrl}`,
    html: layout("Your password was changed", [
      `Hi ${name},`,
      "Your DirectorXO password was just changed and all other sessions were signed out.",
      `If this was not you, <a href="${escapeHtml(resetUrl)}">reset your password</a> immediately.`,
    ]),
  };
}

export type MfaNotice =
  "enabled" | "disabled" | "recovery-codes-regenerated" | "recovery-code-used";

const MFA_NOTICES: Record<MfaNotice, { subject: string; title: string; body: string }> = {
  enabled: {
    subject: "Two-step verification is on for your DirectorXO account",
    title: "Two-step verification turned on",
    body: "Two-step verification was just turned on for your DirectorXO account. Other sessions were signed out.",
  },
  disabled: {
    subject: "Two-step verification was turned off for your DirectorXO account",
    title: "Two-step verification turned off",
    body: "Two-step verification was just turned off for your DirectorXO account.",
  },
  "recovery-codes-regenerated": {
    subject: "New DirectorXO recovery codes were created",
    title: "New recovery codes",
    body: "New recovery codes were just created for your DirectorXO account. Your previous codes no longer work.",
  },
  "recovery-code-used": {
    subject: "A DirectorXO recovery code was used to sign in",
    title: "Recovery code used",
    body: "A recovery code was just used to sign in to your DirectorXO account. Each code works once.",
  },
};

/** Security notice for MFA changes. Never includes codes, secrets or links with tokens. */
export function mfaNoticeEmail(
  to: { name: string; email: string },
  notice: MfaNotice,
  resetUrl: string,
): EmailMessage {
  const n = MFA_NOTICES[notice];
  return {
    to: to.email,
    category: `auth.mfa-${notice}`,
    subject: n.subject,
    text: `Hi ${to.name},\n\n${n.body}\n\nIf this was not you, reset your password immediately: ${resetUrl}`,
    html: layout(n.title, [
      `Hi ${escapeHtml(to.name)},`,
      escapeHtml(n.body),
      `If this was not you, <a href="${escapeHtml(resetUrl)}">reset your password</a> immediately.`,
    ]),
  };
}
