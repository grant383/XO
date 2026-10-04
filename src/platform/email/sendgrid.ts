import {
  EmailDeliveryError,
  type EmailAddress,
  type EmailMessage,
  type EmailTransport,
  type SendResult,
} from "./types";

const SENDGRID_SEND_URL = "https://api.sendgrid.com/v3/mail/send";

/**
 * SendGrid v3 Mail Send adapter (staging/production). Uses the REST API directly so no
 * vendor SDK is required. Click and open tracking are disabled: transactional links carry
 * single-use tokens that must not be rewritten through, or logged by, a tracking redirect.
 */
export class SendGridTransport implements EmailTransport {
  readonly provider = "sendgrid" as const;

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage, from: EmailAddress): Promise<SendResult> {
    let response: Response;
    try {
      response = await this.fetchImpl(SENDGRID_SEND_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: message.to }] }],
          from,
          subject: message.subject,
          content: [
            { type: "text/plain", value: message.text },
            { type: "text/html", value: message.html },
          ],
          categories: [message.category],
          tracking_settings: {
            click_tracking: { enable: false, enable_text: false },
            open_tracking: { enable: false },
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new EmailDeliveryError("sendgrid");
    }
    if (response.status !== 202) {
      throw new EmailDeliveryError("sendgrid", response.status);
    }
    return { providerMessageId: response.headers.get("x-message-id") ?? undefined };
  }
}
