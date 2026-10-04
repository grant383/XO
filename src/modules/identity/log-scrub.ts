/**
 * Removes credentials and personal data from free-form log text emitted by third-party
 * code (Better Auth logs some messages with raw email addresses). Structured fields are
 * additionally redacted by the pino configuration.
 */
const PATTERNS: Array<[RegExp, string]> = [
  // JWTs (email-verification tokens)
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[jwt]"],
  // token-bearing query parameters and path segments
  [/([?&](?:token|code|callbackURL)=)[^&\s"']+/gi, "$1[redacted]"],
  [/(\/(?:reset-password|verify-email)\/)[^/?\s"']+/gi, "$1[redacted]"],
  // email addresses
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[email]"],
];

export function scrubText(text: string): string {
  return PATTERNS.reduce((acc, [re, replacement]) => acc.replace(re, replacement), text);
}

const SENSITIVE_KEY = /pass(word)?|token|secret|cookie|authorization|hash|otp|code/i;

/** Serialises an arbitrary log argument safely (errors keep name + scrubbed message). */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return scrubText(value);
  if (typeof value !== "object") return value;
  if (value instanceof Error) return { name: value.name, message: scrubText(value.message) };
  if (depth > 3) return "[object]";
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [
      k,
      SENSITIVE_KEY.test(k) ? "[redacted]" : scrubValue(v, depth + 1),
    ]),
  );
}
