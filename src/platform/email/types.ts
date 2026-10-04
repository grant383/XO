/** A rendered transactional email. Bodies may contain single-use links: never log them. */
export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Stable category for provider analytics and delivery events, e.g. `auth.verify-email`. */
  category: string;
};

export type EmailAddress = { email: string; name?: string };

export type SendResult = { providerMessageId?: string };

/** Provider adapter (spec §6 "Integrations are adapters"). */
export interface EmailTransport {
  readonly provider: "smtp" | "sendgrid" | "memory";
  send(message: EmailMessage, from: EmailAddress): Promise<SendResult>;
}

/** Delivery failure. The message carries the provider and status only, never content. */
export class EmailDeliveryError extends Error {
  constructor(
    readonly provider: EmailTransport["provider"],
    readonly status?: number,
  ) {
    super(`Email delivery via ${provider} failed${status ? ` (status ${status})` : ""}`);
    this.name = "EmailDeliveryError";
  }
}

/** Parses `Name <email@host>` or a bare address. */
export function parseAddress(value: string): EmailAddress {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(value);
  if (match) {
    const name = match[1]!.trim();
    return name ? { email: match[2]!.trim(), name } : { email: match[2]!.trim() };
  }
  return { email: value.trim() };
}
