import { describe, expect, it } from "vitest";
import { eventLabel, inboxQuery, readInput } from "@/modules/notifications/policy";

describe("notification policy", () => {
  it("uses safe copy and never echoes unknown action strings", () => {
    expect(eventLabel("auth.login.succeeded")).toBe("Signed in");
    expect(eventLabel("secret-token-financial-description")).toBe("Account activity recorded");
  });
  it("requires a valid cutoff and rejects arbitrary recipient selection", () => {
    expect(readInput.safeParse({ through: "2026-10-06T00:00:00Z" }).success).toBe(true);
    expect(readInput.safeParse({ through: "tomorrow" }).success).toBe(false);
    expect(readInput.safeParse({ through: "2026-10-06T00:00:00Z", userId: "other" }).success).toBe(
      false,
    );
    expect(inboxQuery.safeParse({ unread: "true" }).success).toBe(false);
  });
});
