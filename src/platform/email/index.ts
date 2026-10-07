export type { EmailMessage, EmailTransport, SendResult } from "./types";
export { EmailDeliveryError, parseAddress } from "./types";
export { MemoryTransport, type CapturedEmail } from "./memory";
export { emailLayout, escapeHtml } from "./layout";
export { SendGridTransport } from "./sendgrid";
export { SmtpTransport } from "./smtp";
export { emailTransport, sendEmail, setEmailTransportForTests } from "./send";
export {
  configureEmailOutboxForTests,
  closeEmailOutbox,
  EMAIL_OUTBOX_POLICY,
  emailOutboxCounts,
  enqueueEmail,
  startEmailWorker,
  type EnqueueResult,
} from "./outbox";
