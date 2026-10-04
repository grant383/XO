/**
 * Raised when a venture does not exist or the caller has no active membership. The two
 * cases are deliberately indistinguishable (no venture enumeration).
 */
export class VentureNotFoundError extends Error {
  constructor() {
    super("Venture not found");
    this.name = "VentureNotFoundError";
  }
}

/** The caller is a member but lacks the role required for this action. */
export class VenturePermissionError extends Error {
  constructor(readonly required: readonly string[]) {
    super("Not permitted for this venture");
    this.name = "VenturePermissionError";
  }
}

/** The venture is not in a lifecycle state that allows this action (e.g. already active). */
export class VentureStateError extends Error {
  constructor(readonly status: string) {
    super(`Venture is ${status}`);
    this.name = "VentureStateError";
  }
}

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
