import type { EmailAddress, EmailMessage, EmailTransport, SendResult } from "./types";

export type CapturedEmail = EmailMessage & { from: EmailAddress; sentAt: Date };

/** In-process transport for automated tests. Refused in production by `emailEnv`. */
export class MemoryTransport implements EmailTransport {
  readonly provider = "memory" as const;
  readonly outbox: CapturedEmail[] = [];

  async send(message: EmailMessage, from: EmailAddress): Promise<SendResult> {
    this.outbox.push({ ...message, from, sentAt: new Date() });
    return { providerMessageId: `memory-${this.outbox.length}` };
  }

  clear() {
    this.outbox.length = 0;
  }
}
