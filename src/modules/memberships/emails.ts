import { emailLayout, escapeHtml, type EmailMessage } from "@/platform/email";

/**
 * The invitation email. The same message is sent whether or not the address already has
 * a DirectorXO account, so neither the inviter nor the email reveals account existence.
 */
export function invitationEmail(input: {
  to: string;
  inviterName: string;
  ventureName: string;
  roleLabel: string;
  url: string;
  ttlDays: number;
}): EmailMessage {
  const { to, inviterName, ventureName, roleLabel, url, ttlDays } = input;
  return {
    to,
    category: "team.invitation",
    subject: `${inviterName} invited you to ${ventureName} on DirectorXO`,
    text: `${inviterName} invited you to join ${ventureName} on DirectorXO as ${roleLabel}.\n\nAccept the invitation:\n\n${url}\n\nSign in, or create an account with this email address, to accept. This link expires in ${ttlDays} days and can be used once. If you were not expecting this, you can ignore this email.`,
    html: emailLayout(
      `Join ${ventureName} on DirectorXO`,
      [
        `${escapeHtml(inviterName)} invited you to join <strong>${escapeHtml(ventureName)}</strong> as ${escapeHtml(roleLabel)}.`,
        "Sign in, or create an account with this email address, to accept.",
        `This link expires in ${ttlDays} days and can be used once. If you were not expecting this, you can ignore this email.`,
      ],
      { label: "View invitation", url },
    ),
  };
}
