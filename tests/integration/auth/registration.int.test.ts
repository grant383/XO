import type { Sql } from "postgres";
import { signJWT } from "better-auth/crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools } from "@/platform/db";
import { adminSql } from "../../helpers/db";
import { auditFor } from "../../helpers/audit";
import {
  api,
  createVerifiedUser,
  installTestAuth,
  signIn,
  STRONG_PASSWORD,
  tokenFromEmail,
  uniqueEmail,
  uninstallTestAuth,
} from "../../helpers/auth";

let admin: Sql;
let t: ReturnType<typeof installTestAuth>;

beforeAll(() => {
  admin = adminSql();
  t = installTestAuth();
});
afterAll(async () => {
  uninstallTestAuth();
  await closePools();
  await admin.end();
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("registration", () => {
  it("creates an unverified user with a hashed credential, sends a verification email and no session", async () => {
    const email = uniqueEmail("reg");
    const res = await api("/sign-up/email", {
      body: { name: "Ada Founder", email, password: STRONG_PASSWORD },
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      token: null,
      user: { email, emailVerified: false, name: "Ada Founder" },
    });
    expect(res.setCookies.filter((c) => c.includes("session_token"))).toEqual([]);

    const userId = (res.body!.user as { id: string }).id;
    expect(userId).toMatch(UUID);
    const [user] = await admin`select email, email_verified from users where id = ${userId}`;
    expect(user).toMatchObject({ email, email_verified: false });

    const [account] =
      await admin`select provider_id, password from accounts where user_id = ${userId}`;
    expect(account!.provider_id).toBe("credential");
    expect(account!.password).not.toContain(STRONG_PASSWORD);
    expect(String(account!.password)).toMatch(/^[0-9a-f]+:[0-9a-f]+$/); // scrypt salt:key

    expect(await admin`select 1 from sessions where user_id = ${userId}`).toHaveLength(0);

    const mail = t.mailbox.outbox.filter((m) => m.to === email);
    expect(mail.map((m) => m.category)).toEqual(["auth.verify-email"]);
    expect(mail[0]!.text).toContain("http://localhost:3000/auth/verify-email?token=");

    const events = await auditFor(admin, userId);
    expect(events.map((e) => e.action)).toContain("auth.user.registered");
    expect(events.find((e) => e.action === "auth.user.registered")).toMatchObject({
      outcome: "success",
      venture_id: null,
      ip_address: expect.any(String),
    });
  });

  it("answers a duplicate registration exactly like a new one (no enumeration) and notifies the owner", async () => {
    const existing = await createVerifiedUser(t.mailbox, "dup");
    const before =
      await admin`select count(*)::int as n from users where email = ${existing.email}`;

    const dup = await api("/sign-up/email", {
      body: { name: "Mallory", email: existing.email, password: "another-strong-password" },
    });
    const fresh = await api("/sign-up/email", {
      body: { name: "Mallory", email: uniqueEmail("fresh"), password: "another-strong-password" },
    });

    expect(dup.status).toBe(fresh.status);
    expect(Object.keys(dup.body!).sort()).toEqual(Object.keys(fresh.body!).sort());
    expect(Object.keys(dup.body!.user as object).sort()).toEqual(
      Object.keys(fresh.body!.user as object).sort(),
    );
    const dupUser = dup.body!.user as { id: string; emailVerified: boolean };
    expect(dupUser.id).toMatch(UUID);
    expect(dupUser.id).not.toBe(existing.userId);
    expect(dupUser.emailVerified).toBe(false);

    const after = await admin`select count(*)::int as n from users where email = ${existing.email}`;
    expect(after[0]!.n).toBe(before[0]!.n);

    // The original password still works; the attacker's does not.
    expect((await signIn(existing.email, existing.password)).res.status).toBe(200);
    expect((await signIn(existing.email, "another-strong-password")).res.status).toBe(401);

    const notice = t.mailbox.outbox.filter(
      (m) => m.to === existing.email && m.category === "auth.existing-account",
    );
    expect(notice).toHaveLength(1);

    const events = await auditFor(admin, existing.userId);
    expect(events.map((e) => e.action)).toContain("auth.signup.duplicate_email");
  });

  it("rejects weak passwords, missing names and attempts to set protected fields", async () => {
    const short = await api("/sign-up/email", {
      body: { name: "A", email: uniqueEmail(), password: "short-pw" },
    });
    expect(short.status).toBe(400);
    expect(short.body).toMatchObject({ code: "PASSWORD_TOO_SHORT" });

    const noName = await api("/sign-up/email", {
      body: { name: " ", email: uniqueEmail(), password: STRONG_PASSWORD },
    });
    expect(noName.status).toBe(400);

    const email = uniqueEmail("self-verify");
    const forged = await api("/sign-up/email", {
      body: {
        name: "A",
        email,
        password: STRONG_PASSWORD,
        emailVerified: true,
        twoFactorEnabled: true,
      },
    });
    expect(forged.status).toBe(400);
    expect(await admin`select 1 from users where email = ${email}`).toHaveLength(0);
  });
});

describe("email verification", () => {
  it("blocks sign-in until verified, then verifies once without signing in", async () => {
    const email = uniqueEmail("verify");
    const reg = await api("/sign-up/email", {
      body: { name: "V", email, password: STRONG_PASSWORD },
    });
    const userId = (reg.body!.user as { id: string }).id;

    const early = await signIn(email, STRONG_PASSWORD);
    expect(early.res.status).toBe(403);
    expect(early.res.body).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    expect(early.res.setCookies.filter((c) => c.includes("session_token"))).toEqual([]);
    // A fresh link is sent on a blocked sign-in with the correct password.
    expect(
      t.mailbox.outbox.filter((m) => m.to === email && m.category === "auth.verify-email"),
    ).toHaveLength(2);

    const token = tokenFromEmail(t.mailbox, email, "auth.verify-email");
    const ok = await api("/verify-email", { query: { token } });
    expect(ok.status).toBe(200);
    expect(ok.setCookies.filter((c) => c.includes("session_token"))).toEqual([]);

    const [user] = await admin`select email_verified from users where id = ${userId}`;
    expect(user!.email_verified).toBe(true);
    expect((await signIn(email, STRONG_PASSWORD)).res.status).toBe(200);

    const events = await auditFor(admin, userId);
    expect(events.map((e) => e.action)).toContain("auth.email.verified");
  });

  it("rejects a replayed verification token (single-use)", async () => {
    const email = uniqueEmail("replay");
    await api("/sign-up/email", { body: { name: "R", email, password: STRONG_PASSWORD } });
    const token = tokenFromEmail(t.mailbox, email, "auth.verify-email");

    expect((await api("/verify-email", { query: { token } })).status).toBe(200);
    const replay = await api("/verify-email", { query: { token } });
    expect(replay.status).toBe(401);
    expect(replay.body).toMatchObject({ code: "INVALID_TOKEN" });

    const [row] =
      await admin`select count(*)::int as n from auth_consumed_tokens where purpose = 'email-verification'
                               and token_hash <> ${token}`;
    expect(row!.n).toBeGreaterThan(0);
    expect(
      await admin`select 1 from auth_consumed_tokens where token_hash = ${token}`,
    ).toHaveLength(0);
    const failures = await admin`select metadata from audit_log
                                  where action = 'auth.email.verification_failed'
                                    and metadata->>'reason' = 'TOKEN_ALREADY_USED'`;
    expect(failures.length).toBeGreaterThan(0);
  });

  it("rejects expired and tampered tokens", async () => {
    const email = uniqueEmail("expired");
    const reg = await api("/sign-up/email", {
      body: { name: "E", email, password: STRONG_PASSWORD },
    });
    const userId = (reg.body!.user as { id: string }).id;

    const expired = await signJWT({ email }, process.env.AUTH_SECRET!, -60);
    const res = await api("/verify-email", { query: { token: expired } });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "TOKEN_EXPIRED" });

    const forged = await signJWT({ email }, "attacker-controlled-secret-0123456789abcdef", 3600);
    expect((await api("/verify-email", { query: { token: forged } })).status).toBe(401);

    const valid = tokenFromEmail(t.mailbox, email, "auth.verify-email");
    const tampered = `${valid.slice(0, -4)}AAAA`;
    expect((await api("/verify-email", { query: { token: tampered } })).status).toBe(401);

    const [user] = await admin`select email_verified from users where id = ${userId}`;
    expect(user!.email_verified).toBe(false);
  });

  it("resends verification without revealing whether the account exists", async () => {
    const email = uniqueEmail("resend");
    await api("/sign-up/email", { body: { name: "R", email, password: STRONG_PASSWORD } });
    const known = await api("/send-verification-email", { body: { email } });
    const unknown = await api("/send-verification-email", {
      body: { email: uniqueEmail("nobody") },
    });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
  });
});
