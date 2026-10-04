import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from "vitest";
import { closePools } from "@/platform/db";
import { logger } from "@/platform/observability/logger";
import { adminSql } from "../../helpers/db";
import {
  api,
  createVerifiedUser,
  installTestAuth,
  sessionCookieName,
  signIn,
  STRONG_PASSWORD,
  tokenFromEmail,
  uniqueEmail,
  uninstallTestAuth,
} from "../../helpers/auth";

/**
 * Spec §20/§21 and DoD: passwords, tokens, raw session values and secrets must never
 * appear in logs, error responses or audit records.
 */
let admin: Sql;
let t: ReturnType<typeof installTestAuth>;
const LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
let spies: MockInstance[] = [];

beforeAll(() => {
  admin = adminSql();
  t = installTestAuth();
  spies = LEVELS.map((level) => vi.spyOn(logger, level));
});
afterAll(async () => {
  for (const s of spies) s.mockRestore();
  uninstallTestAuth();
  await closePools();
  await admin.end();
});

const captured = () =>
  spies.flatMap((s) => s.mock.calls.map((args) => JSON.stringify(args))).join("\n");

describe("secrets never leak", () => {
  it("across every authentication flow: logs, error bodies and audit records stay clean", async () => {
    const secrets: string[] = [STRONG_PASSWORD, process.env.AUTH_SECRET!];
    const emails: string[] = [];
    const errorBodies: string[] = [];

    // Registration, duplicate registration, verification (incl. replay).
    const email = uniqueEmail("leak");
    emails.push(email);
    const reg = await api("/sign-up/email", {
      body: { name: "Leak Test", email, password: STRONG_PASSWORD },
    });
    const userId = (reg.body!.user as { id: string }).id;
    await api("/sign-up/email", { body: { name: "Dup", email, password: "duplicate-password-1" } });
    secrets.push("duplicate-password-1");
    const verifyToken = tokenFromEmail(t.mailbox, email, "auth.verify-email");
    secrets.push(verifyToken);
    await api("/verify-email", { query: { token: verifyToken } });
    errorBodies.push((await api("/verify-email", { query: { token: verifyToken } })).text);

    // Failed and successful sign-in.
    errorBodies.push((await signIn(email, "wrong-password-value")).res.text);
    secrets.push("wrong-password-value");
    const { jar } = await signIn(email, STRONG_PASSWORD);
    const cookie = jar.get(sessionCookieName())!;
    secrets.push(cookie, decodeURIComponent(cookie));
    const [session] = await admin`select token from sessions where user_id = ${userId}`;
    secrets.push(String(session!.token));

    // Session reads, password change, logout.
    await api("/get-session", { jar });
    await api("/change-password", {
      body: {
        currentPassword: STRONG_PASSWORD,
        newPassword: "changed-password-value",
        revokeOtherSessions: true,
      },
      jar,
    });
    secrets.push("changed-password-value");
    errorBodies.push(
      (
        await api("/change-password", {
          body: { currentPassword: "nope-nope-nope", newPassword: "x".repeat(20) },
          jar,
        })
      ).text,
    );
    await api("/sign-out", { body: {}, jar });

    // Password reset: request, invalid token, success.
    await api("/request-password-reset", { body: { email } });
    const resetToken = tokenFromEmail(t.mailbox, email, "auth.reset-password");
    secrets.push(resetToken);
    errorBodies.push(
      (
        await api("/reset-password", {
          body: { token: `${resetToken}x`, newPassword: "reset-password-value" },
        })
      ).text,
    );
    await api("/reset-password", {
      body: { token: resetToken, newPassword: "reset-password-value" },
    });
    secrets.push("reset-password-value");

    // Unknown-account paths.
    const ghost = uniqueEmail("ghost");
    emails.push(ghost);
    await api("/request-password-reset", { body: { email: ghost } });
    errorBodies.push((await signIn(ghost, "ghost-password-value")).res.text);
    secrets.push("ghost-password-value");

    const logs = captured();
    const audit = JSON.stringify(
      await admin`select * from audit_log where subject_user_id = ${userId} or actor_user_id = ${userId}
                  or occurred_at > now() - interval '5 minutes'`,
    );

    expect(logs.length).toBeGreaterThan(0);
    for (const secret of secrets) {
      expect(logs, "logs").not.toContain(secret);
      expect(audit, "audit").not.toContain(secret);
      for (const body of errorBodies) expect(body, "error body").not.toContain(secret);
    }
    for (const address of emails) {
      expect(logs, "logs contain a raw email address").not.toContain(address);
      expect(audit, "audit contains a raw email address").not.toContain(address);
    }
  });

  it("never stores session tokens or verification tokens in plaintext where they are not needed", async () => {
    const u = await createVerifiedUser(t.mailbox, "at-rest");
    await api("/request-password-reset", { body: { email: u.email } });
    const resetToken = tokenFromEmail(t.mailbox, u.email, "auth.reset-password");
    const verificationRows = JSON.stringify(await admin`select * from verifications`);
    expect(verificationRows).not.toContain(resetToken);

    const consumed = JSON.stringify(await admin`select * from auth_consumed_tokens`);
    expect(consumed).not.toMatch(/eyJ[\w-]+\./);
  });
});
