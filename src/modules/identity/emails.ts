import type { EmailMessage } from "@/platform/email";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function layout(title: string, paragraphs: string[], action?: { label: string; url: string }) {
  const body = paragraphs.map((p) => `<p>${p}</p>`).join("\n");
  const button = action
    ? `<p><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:12px 20px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px">${escapeHtml(action.label)}</a></p>
<p style="font-size:12px;color:#6b7280">If the button does not work, copy this link into your browser:<br>${escapeHtml(action.url)}</p>`
    : "";
  return `<!doctype html><html lang="en-GB"><body style="font-family:system-ui,sans-serif;color:#111827;max-width:560px;margin:0 auto;padding:24px">
<h1 style="font-size:20px">${escapeHtml(title)}</h1>
${body}
${button}
<p style="font-size:12px;color:#6b7280">DirectorXO</p>
</body></html>`;
}

/** Page that consumes the token on an explicit POST, so link scanners cannot burn it. */
export const verifyEmailUrl = (appUrl: string, token: string) =>
  `${appUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;
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
