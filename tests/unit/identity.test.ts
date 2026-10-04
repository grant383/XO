import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "@/platform/observability/logger";
import { scrubText, scrubValue } from "@/modules/identity/log-scrub";
import {
  existingAccountEmail,
  passwordResetEmail,
  resetPasswordUrl,
  verificationEmail,
  verifyEmailUrl,
} from "@/modules/identity/emails";
import {
  loginInput,
  mfaChallengeInput,
  registerInput,
  resetPasswordInput,
} from "@/modules/identity/flows";
import {
  DISABLED_PATHS,
  MFA_POLICY,
  PASSWORD_POLICY,
  RATE_LIMITS,
  SESSION_POLICY,
} from "@/modules/identity/policy";

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6ImFAYi5jIn0.c2lnbmF0dXJlLXZhbHVl";

describe("log scrubbing", () => {
  it("removes JWTs, token parameters, token path segments and email addresses", () => {
    const text = scrubText(
      `Sign-up attempt for existing email: Founder@Example.co.uk url=https://x.test/verify-email?token=${JWT}&callbackURL=/a ` +
        "reset https://x.test/api/v1/auth/reset-password/abc123XYZ",
    );
    expect(text).not.toContain("Founder@Example.co.uk");
    expect(text).not.toContain(JWT);
    expect(text).not.toContain("abc123XYZ");
    expect(text).toContain("[email]");
  });

  it("redacts sensitive keys in structured values and keeps error names", () => {
    const out = JSON.stringify(
      scrubValue([
        { password: "p@ss", nested: { sessionToken: "s", ok: "fine" } },
        new Error(`bad ${JWT}`),
      ]),
    );
    expect(out).not.toContain("p@ss");
    expect(out).not.toContain(JWT);
    expect(out).toContain("fine");
    expect(out).toContain('"name":"Error"');
  });
});

describe("logger redaction", () => {
  it("censors credentials, tokens and cookies in structured fields", () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        lines.push(String(chunk));
        cb();
      },
    });
    const log = createLogger(sink);
    log.info(
      {
        password: "hunter2-password",
        body: { newPassword: "next-password", token: "tok-123" },
        headers: { cookie: "dxo.session_token=abc", authorization: "Bearer xyz" },
      },
      "event",
    );
    const out = lines.join("");
    for (const secret of [
      "hunter2-password",
      "next-password",
      "tok-123",
      "dxo.session_token=abc",
      "Bearer xyz",
    ]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain("[redacted]");
  });
});

describe("email templates", () => {
  it("link to DirectorXO pages that require an explicit action (not the GET API)", () => {
    expect(verifyEmailUrl("https://app.directorxo.com", "a b")).toBe(
      "https://app.directorxo.com/auth/verify-email?token=a%20b",
    );
    expect(resetPasswordUrl("https://app.directorxo.com", "t")).toBe(
      "https://app.directorxo.com/auth/reset-password?token=t",
    );
  });

  it("escapes user-controlled names in HTML", () => {
    const evil = { name: `<script>alert("x")</script>`, email: "a@b.test" };
    for (const message of [
      verificationEmail(evil, "https://x/y", 24),
      passwordResetEmail(evil, "https://x/y", 30),
      existingAccountEmail(evil, "https://x/login", "https://x/reset"),
    ]) {
      expect(message.html).not.toContain("<script>");
      expect(message.html).toContain("&#60;script&#62;");
      expect(message.to).toBe("a@b.test");
    }
  });

  it("state expiry and single use", () => {
    const m = passwordResetEmail({ name: "A", email: "a@b.test" }, "https://x/y", 30);
    expect(m.text).toContain("30 minutes");
    expect(m.text).toContain("used once");
    expect(m.text).toContain("signs you out on every device");
  });
});

describe("flow validation", () => {
  it("enforces the password policy and normalises email", () => {
    expect(
      registerInput.safeParse({
        name: "A",
        email: "a@b.test",
        password: "x".repeat(PASSWORD_POLICY.minLength - 1),
      }).success,
    ).toBe(false);
    expect(
      registerInput.safeParse({
        name: "A",
        email: "a@b.test",
        password: "x".repeat(PASSWORD_POLICY.maxLength + 1),
      }).success,
    ).toBe(false);
    const ok = registerInput.parse({
      name: " Ada ",
      email: " Ada@Example.TEST ",
      password: "x".repeat(12),
    });
    expect(ok).toMatchObject({ name: "Ada", email: "ada@example.test" });
    expect(loginInput.parse({ email: "a@b.test", password: "p" }).rememberMe).toBe(true);
    expect(
      resetPasswordInput.safeParse({ token: "short", newPassword: "x".repeat(12) }).success,
    ).toBe(false);
  });
});

describe("policy invariants", () => {
  it("keeps the absolute lifetime above the idle timeout, and the refresh interval below it", () => {
    expect(SESSION_POLICY.absoluteLifetimeSec).toBeGreaterThan(SESSION_POLICY.idleTimeoutSec);
    expect(SESSION_POLICY.refreshIntervalSec).toBeLessThan(SESSION_POLICY.idleTimeoutSec);
  });

  it("disables social/OAuth and account-mutation endpoints that P0 does not use", () => {
    for (const path of ["/sign-in/social", "/change-email", "/delete-user", "/update-session"]) {
      expect(DISABLED_PATHS).toContain(path);
    }
  });
});

describe("MFA input and policy", () => {
  it("normalises authenticator and recovery codes and rejects anything else", () => {
    expect(mfaChallengeInput.parse({ method: "totp", code: " 123 456 " })).toEqual({
      method: "totp",
      code: "123456",
    });
    expect(mfaChallengeInput.parse({ method: "recovery", code: " AbCde-12345 " }).code).toBe(
      "AbCde-12345",
    );
    expect(mfaChallengeInput.parse({ method: "recovery", code: "AbCde12345" }).code).toBe(
      "AbCde12345",
    );
    for (const bad of [
      { method: "totp", code: "12345" },
      { method: "totp", code: "12345a" },
      { method: "recovery", code: "short" },
      { method: "recovery", code: "abcde-12345-x" },
      { method: "email", code: "123456" },
    ]) {
      expect(mfaChallengeInput.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("rate-limits every second-factor endpoint and disables OTP and secret read-back", () => {
    for (const path of [
      "/two-factor/verify-totp",
      "/two-factor/verify-backup-code",
      "/two-factor/enable",
      "/two-factor/disable",
      "/two-factor/generate-backup-codes",
    ]) {
      expect(RATE_LIMITS[path], path).toBeDefined();
    }
    expect(DISABLED_PATHS).toEqual(
      expect.arrayContaining([
        "/two-factor/send-otp",
        "/two-factor/verify-otp",
        "/two-factor/get-totp-uri",
      ]),
    );
    expect(MFA_POLICY.challengeTtlSec).toBeLessThanOrEqual(SESSION_POLICY.freshAgeSec);
  });
});
