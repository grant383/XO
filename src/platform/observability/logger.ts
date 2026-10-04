import pino, { type DestinationStream, type LoggerOptions } from "pino";

/**
 * Structured JSON logger. Credentials, tokens and cookies are redacted (spec §21:
 * telemetry must never include passwords, tokens or unnecessary personal data).
 */
export const loggerOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: process.env.SERVICE_NAME ?? "web" },
  redact: {
    paths: [
      "password",
      "*.password",
      "newPassword",
      "*.newPassword",
      "currentPassword",
      "*.currentPassword",
      "token",
      "*.token",
      "sessionToken",
      "*.sessionToken",
      "secret",
      "*.secret",
      "headers.authorization",
      "headers.cookie",
      'headers["set-cookie"]',
      "*.headers.authorization",
      "*.headers.cookie",
      '*.headers["set-cookie"]',
      "*.accessToken",
      "*.refreshToken",
      "*.idToken",
    ],
    censor: "[redacted]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

/** Builds a logger with the standard options (tests pass an in-memory destination). */
export function createLogger(destination?: DestinationStream) {
  return destination ? pino(loggerOptions, destination) : pino(loggerOptions);
}

export const logger = createLogger();
