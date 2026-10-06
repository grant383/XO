import { describe, expect, it } from "vitest";
import { supportInput, supportCursor } from "@/modules/support/policy";

describe("support validation", () => {
  const valid = {
    requestId: "00000000-0000-4000-8000-000000000001",
    subject: "Help",
    description: "Cannot finish onboarding",
  };
  it("trims the submitted copy and rejects caller-supplied ownership and status", () => {
    expect(supportInput.parse({ ...valid, subject: "  Help  " }).subject).toBe("Help");
    expect(supportInput.safeParse({ ...valid, userId: valid.requestId }).success).toBe(false);
    expect(supportInput.safeParse({ ...valid, status: "resolved" }).success).toBe(false);
  });
  it("bounds subject, description and idempotency key", () => {
    for (const update of [
      { subject: " " },
      { subject: "a".repeat(201) },
      { description: "short" },
      { description: "a".repeat(5001) },
      { requestId: "invalid" },
    ])
      expect(supportInput.safeParse({ ...valid, ...update }).success).toBe(false);
  });
  it("validates both parts of the stable timestamp/UUID cursor", () => {
    expect(
      supportCursor.safeParse({ at: "2026-10-06T00:00:00.000Z", id: valid.requestId }).success,
    ).toBe(true);
    expect(supportCursor.safeParse({ at: "yesterday", id: valid.requestId }).success).toBe(false);
  });
});
