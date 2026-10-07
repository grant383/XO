import { emailEnv } from "@/platform/config/env";
import { logger } from "@/platform/observability/logger";
import { MemoryTransport } from "./memory";
import { SendGridTransport } from "./sendgrid";
import { SmtpTransport } from "./smtp";
import { parseAddress, type EmailMessage, type EmailTransport, type SendResult } from "./types";

let transport: EmailTransport | undefined;

function createTransport(): EmailTransport {
  const env = emailEnv();
  switch (env.EMAIL_PROVIDER) {
    case "smtp":
      return new SmtpTransport(env.SMTP_URL);
    case "sendgrid":
      return new SendGridTransport(env.SENDGRID_API_KEY);
    case "memory":
      return new MemoryTransport();
  }
}

/** The configured transport (memoised). */
export function emailTransport(): EmailTransport {
  transport ??= createTransport();
  return transport;
}

/** Test seam: replaces the configured transport. */
export function setEmailTransportForTests(next: EmailTransport | undefined) {
  transport = next;
}

/**
 * Sends a transactional email. Logs category and provider message id only — never the
 * recipient address, subject or body (bodies contain single-use links).
 */
export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const t = emailTransport();
  const started = Date.now();
  try {
    const result = await t.send(message, parseAddress(emailEnv().EMAIL_FROM));
    logger.info(
      {
        email: { provider: t.provider, category: message.category, id: result.providerMessageId },
        durationMs: Date.now() - started,
      },
      "email sent",
    );
    return result;
  } catch (error) {
    logger.error(
      {
        email: { provider: t.provider, category: message.category },
        err: error instanceof Error ? { name: error.name, message: error.message } : undefined,
      },
      "email delivery failed",
    );
    throw error;
  }
}
