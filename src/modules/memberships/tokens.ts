import { createHash, randomBytes } from "node:crypto";

/**
 * Invitation tokens: 256 random bits, base64url (43 characters). Only the SHA-256 digest
 * is stored (`venture_invitations.token_hash`); the raw token exists only in the
 * invitation email and the invitee's URL, so a database read cannot accept an invitation.
 */
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export function generateInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export function isWellFormedInvitationToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN_FORMAT.test(token);
}

/** Path of the invitation page; the token is the only identifier in the link. */
export const invitationPath = (token: string) => `/invite/${token}` as const;
