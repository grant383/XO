/** Unwraps driver/ORM wrappers to the PostgreSQL SQLSTATE, if any. */
export function pgCode(error: unknown): string | undefined {
  let current: unknown = error;
  while (current && typeof current === "object") {
    const e = current as { code?: unknown; cause?: unknown };
    if (typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) return e.code;
    current = e.cause;
  }
  return undefined;
}

export function pgMessage(error: unknown): string {
  let current: unknown = error;
  while (current && typeof current === "object") {
    const e = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) return String(e.message ?? "");
    current = e.cause;
  }
  return "";
}
