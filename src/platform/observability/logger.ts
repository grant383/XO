import pino from "pino";

/**
 * Structured JSON logger. Credentials, tokens and cookies are redacted (spec §21:
 * telemetry must never include passwords, tokens or unnecessary personal data).
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: process.env.SERVICE_NAME ?? "web" },
  redact: {
    paths: [
      "password",
      "*.password",
      "token",
      "*.token",
      "secret",
      "*.secret",
      "headers.authorization",
      "headers.cookie",
      'headers["set-cookie"]',
      "*.accessToken",
      "*.refreshToken",
    ],
    censor: "[redacted]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
