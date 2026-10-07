import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { encryptionEnv } from "@/platform/config/env";

/**
 * Authenticated encryption (AES-256-GCM) for data held outside PostgreSQL, such as queued
 * email payloads that contain single-use links (ADR-0023). The associated data binds a
 * ciphertext to its context (e.g. the job id), so a sealed value cannot be replayed under
 * another identity. Sealed format: `v1.<keyId>.<iv>.<ciphertext>.<tag>` (base64url).
 */
type Key = { id: string; material: Buffer };

/** A non-secret fingerprint used to select the decryption key during rotation. */
const keyOf = (base64: string): Key => {
  const material = Buffer.from(base64, "base64");
  return { id: createHash("sha256").update(material).digest("hex").slice(0, 12), material };
};

function keyring(): { current: Key; all: Key[] } {
  const env = encryptionEnv();
  const current = keyOf(env.ENCRYPTION_KEY);
  const all = [current];
  if (env.ENCRYPTION_KEY_PREVIOUS) all.push(keyOf(env.ENCRYPTION_KEY_PREVIOUS));
  return { current, all };
}

/** The sealed value is malformed, was sealed with an unknown key, or failed authentication. */
export class EnvelopeError extends Error {
  constructor(readonly reason: "format" | "unknown_key" | "authentication") {
    super(`Sealed value could not be opened (${reason})`);
    this.name = "EnvelopeError";
  }
}

export function seal(plaintext: string, associatedData: string): string {
  const { current } = keyring();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", current.material, iv);
  cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", current.id, iv, body, tag]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function open(sealed: string, associatedData: string): string {
  const parts = sealed.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") throw new EnvelopeError("format");
  const [, keyId, iv, body, tag] = parts as [string, string, string, string, string];
  const key = keyring().all.find((k) => k.id === keyId);
  if (!key) throw new EnvelopeError("unknown_key");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key.material, Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(associatedData, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(body, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new EnvelopeError("authentication");
  }
}
