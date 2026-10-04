import nodemailer, { type Transporter } from "nodemailer";
import {
  EmailDeliveryError,
  type EmailAddress,
  type EmailMessage,
  type EmailTransport,
  type SendResult,
} from "./types";

/** SMTP adapter. Used with Mailpit for local development (never in production). */
export class SmtpTransport implements EmailTransport {
  readonly provider = "smtp" as const;
  private readonly transporter: Transporter;

  constructor(url: string) {
    this.transporter = nodemailer.createTransport(url);
  }

  async send(message: EmailMessage, from: EmailAddress): Promise<SendResult> {
    try {
      const info = await this.transporter.sendMail({
        from: from.name ? { name: from.name, address: from.email } : from.email,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        headers: { "X-DXO-Category": message.category },
      });
      return { providerMessageId: info.messageId };
    } catch {
      // The underlying error may echo the envelope; do not propagate it.
      throw new EmailDeliveryError("smtp");
    }
  }
}
