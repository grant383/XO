import { describe, expect, it } from "vitest";
import { withService, withTenant, withUser } from "@/platform/db";

// Validation happens before any connection is opened, so no database is needed here.
describe("tenant context validation", () => {
  const venture = "6f1c0c2e-7d4b-4f7e-9d7a-2b8f0e6c1a11";

  it("rejects non-UUID user and venture ids", async () => {
    await expect(withUser({ userId: "1 or 1=1" }, async () => 1)).rejects.toThrow();
    await expect(
      withTenant({ userId: venture, ventureId: "../other" }, async () => 1),
    ).rejects.toThrow();
  });

  it("requires namespaced lowercase service identities", async () => {
    await expect(withService({ serviceId: "worker" }, async () => 1)).rejects.toThrow();
    await expect(withService({ serviceId: "Worker:Email" }, async () => 1)).rejects.toThrow();
    await expect(
      withService({ serviceId: "worker:email", ventureId: "nope" }, async () => 1),
    ).rejects.toThrow();
  });
});
