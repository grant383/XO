import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const key = () => randomBytes(32).toString("base64");

async function load() {
  vi.resetModules();
  return import("@/platform/security/envelope");
}

describe("envelope encryption (ADR-0023)", () => {
  let current: string;
  beforeEach(() => {
    current = key();
    vi.stubEnv("ENCRYPTION_KEY", current);
    vi.stubEnv("ENCRYPTION_KEY_PREVIOUS", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("round-trips and never contains the plaintext", async () => {
    const { seal, open } = await load();
    const secret = "https://app.test/auth/reset-password?token=single-use";
    const sealed = seal(secret, "job-1");
    expect(sealed).not.toContain("single-use");
    expect(sealed.split(".")).toHaveLength(5);
    expect(open(sealed, "job-1")).toBe(secret);
    expect(seal(secret, "job-1")).not.toBe(sealed); // random IV
  });

  it("binds the ciphertext to its associated data", async () => {
    const { seal, open, EnvelopeError } = await load();
    const sealed = seal("payload", "job-1");
    expect(() => open(sealed, "job-2")).toThrow(EnvelopeError);
  });

  it("rejects tampering and malformed values", async () => {
    const { seal, open } = await load();
    const parts = seal("payload", "job-1").split(".");
    const body = Buffer.from(parts[3]!, "base64url");
    body[0] = body[0]! ^ 1;
    parts[3] = body.toString("base64url");
    expect(() => open(parts.join("."), "job-1")).toThrow(/authentication/);
    expect(() => open("v2.a.b.c.d", "job-1")).toThrow(/format/);
  });

  it("opens values sealed with the previous key during rotation only", async () => {
    let mod = await load();
    const sealed = mod.seal("payload", "job-1");
    const next = key();
    vi.stubEnv("ENCRYPTION_KEY", next);
    vi.stubEnv("ENCRYPTION_KEY_PREVIOUS", current);
    mod = await load();
    expect(mod.open(sealed, "job-1")).toBe("payload");
    vi.stubEnv("ENCRYPTION_KEY_PREVIOUS", "");
    mod = await load();
    expect(() => mod.open(sealed, "job-1")).toThrow(/unknown_key/);
  });

  it("requires a 256-bit base64 key and never echoes it", async () => {
    vi.stubEnv("ENCRYPTION_KEY", "replace-with-local-key");
    const { seal } = await load();
    expect(() => seal("x", "y")).toThrow(/ENCRYPTION_KEY/);
    expect(() => seal("x", "y")).not.toThrow(/replace-with-local-key/);
  });
});
