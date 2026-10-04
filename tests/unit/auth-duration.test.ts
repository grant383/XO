import { describe, expect, it } from "vitest";
import { durationLabel } from "@/app/auth/duration";
import { TOKEN_POLICY } from "@/modules/identity";

describe("durationLabel", () => {
  it("states token lifetimes from policy, not design copy", () => {
    expect(durationLabel(TOKEN_POLICY.emailVerificationTtlSec)).toBe("24 hours");
    expect(durationLabel(TOKEN_POLICY.passwordResetTtlSec)).toBe("30 minutes");
  });

  it("uses singular units", () => {
    expect(durationLabel(3600)).toBe("1 hour");
    expect(durationLabel(60)).toBe("1 minute");
  });
});
