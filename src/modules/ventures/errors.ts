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

export { pgCode, pgMessage } from "@/platform/db";
