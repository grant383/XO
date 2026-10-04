import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools } from "@/platform/db";
import {
  getMfaStatus,
  hasMfaChallenge,
  login,
  startMfaEnrolment,
  verifyMfaChallenge,
} from "@/modules/identity";
import { adminSql } from "../../helpers/db";
import { auditFor } from "../../helpers/audit";
import {
  api,
  CookieJar,
  createVerifiedUser,
  freshIp,
  installTestAuth,
  sessionCookieName,
  signIn,
  uninstallTestAuth,
} from "../../helpers/auth";
import { totp } from "../../helpers/totp";

/**
 * TOTP multi-factor authentication and recovery codes (ADR-0016), exercised through the
 * real `/api/v1/auth/*` handler and the identity flows used by server actions.
 */
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

const CHALLENGE_COOKIE = "dxo.two_factor";
const headersFor = (jar: CookieJar) =>
  new Headers({
    cookie: jar.header(),
    "x-forwarded-for": freshIp(),
    origin: "http://localhost:3000",
  });
const actions = async (userId: string) => (await auditFor(admin, userId)).map((e) => e.action);

/** A verified user with MFA enrolled and confirmed through the HTTP API. */
async function enrolledUser(label: string) {
  const u = await createVerifiedUser(t.mailbox, label);
  const { jar } = await signIn(u.email, u.password);
  const enable = await api("/two-factor/enable", {
    body: { password: u.password, method: "totp" },
    jar,
  });
  expect(enable.status).toBe(200);
  const uri = new URL(enable.body!.totpURI as string);
  const manualKey = uri.searchParams.get("secret")!;
  const recoveryCodes = enable.body!.backupCodes as string[];
  const confirm = await api("/two-factor/verify-totp", { body: { code: totp(manualKey) }, jar });
  expect(confirm.status).toBe(200);
  return { ...u, jar, manualKey, recoveryCodes };
}

/** Password step of a sign-in for an MFA account: returns the jar holding the challenge. */
async function firstFactor(email: string, password: string) {
  const jar = new CookieJar();
  const res = await api("/sign-in/email", { body: { email, password }, jar });
  return { jar, res };
}

describe("enrolment", () => {
  it("re-checks the password, then stores an encrypted, unconfirmed factor", async () => {
    const u = await createVerifiedUser(t.mailbox, "mfa-enrol");
    const { jar } = await signIn(u.email, u.password);

    const wrong = await startMfaEnrolment({ password: "not-my-password-at-all" }, headersFor(jar));
    expect(wrong).toMatchObject({ ok: false, code: "INVALID_CREDENTIALS" });

    const started = await startMfaEnrolment({ password: u.password }, headersFor(jar));
    if (!started.ok) throw new Error(started.code);
    expect(started.data.totpUri).toMatch(/^otpauth:\/\/totp\/DirectorXO:/);
    expect(started.data.manualKey).toMatch(/^[A-Z2-7]+$/);
    expect(started.data.recoveryCodes).toHaveLength(10);
    for (const code of started.data.recoveryCodes)
      expect(code).toMatch(/^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/);

    const [row] = await admin`select secret, backup_codes, verified from two_factors
                              where user_id = ${u.userId}`;
    expect(row!.verified).toBe(false);
    // Neither the secret nor any recovery code is stored in plaintext.
    expect(row!.secret).not.toContain(started.data.manualKey);
    for (const code of started.data.recoveryCodes) expect(row!.backup_codes).not.toContain(code);
    const [user] = await admin`select two_factor_enabled from users where id = ${u.userId}`;
    expect(user!.two_factor_enabled).toBe(false);

    const events = await auditFor(admin, u.userId);
    expect(events.map((e) => e.action)).toEqual(
      expect.arrayContaining(["auth.mfa.change_failed", "auth.mfa.enrolment_started"]),
    );
    expect(JSON.stringify(events)).not.toContain(started.data.manualKey);
  });

  it("activates only after a valid code and signs out every other session", async () => {
    const u = await createVerifiedUser(t.mailbox, "mfa-confirm");
    const { jar } = await signIn(u.email, u.password);
    const { jar: otherDevice } = await signIn(u.email, u.password);

    const enable = await api("/two-factor/enable", {
      body: { password: u.password, method: "totp" },
      jar,
    });
    const manualKey = new URL(enable.body!.totpURI as string).searchParams.get("secret")!;

    const bad = await api("/two-factor/verify-totp", { body: { code: "000000" }, jar });
    expect(bad.status).toBe(401);
    let [user] = await admin`select two_factor_enabled from users where id = ${u.userId}`;
    expect(user!.two_factor_enabled).toBe(false);

    const before = jar.get(sessionCookieName());
    const ok = await api("/two-factor/verify-totp", { body: { code: totp(manualKey) }, jar });
    expect(ok.status).toBe(200);
    expect(ok.body!.token).toBeNull(); // never exposed to browser scripts
    [user] = await admin`select two_factor_enabled from users where id = ${u.userId}`;
    expect(user!.two_factor_enabled).toBe(true);

    // The current session is rotated and still valid; the other device is signed out.
    expect(jar.get(sessionCookieName())).not.toBe(before);
    expect((await api("/get-session", { jar })).body).not.toBeNull();
    expect((await api("/get-session", { jar: otherDevice })).body).toBeNull();

    const events = await actions(u.userId);
    expect(events).toContain("auth.mfa.enabled");
    expect(
      t.mailbox.outbox.some((m) => m.to === u.email && m.category === "auth.mfa-enabled"),
    ).toBe(true);
  });

  it("cannot be restarted while MFA is on", async () => {
    const u = await enrolledUser("mfa-twice");
    const res = await startMfaEnrolment({ password: u.password }, headersFor(u.jar));
    expect(res).toMatchObject({ ok: false, code: "VALIDATION" });
    const http = await api("/two-factor/enable", {
      body: { password: u.password, method: "totp" },
      jar: u.jar,
    });
    expect(http.status).toBe(400);
  });

  it("does not offer email/SMS codes or reading the secret back", async () => {
    const u = await enrolledUser("mfa-surface");
    for (const path of [
      "/two-factor/send-otp",
      "/two-factor/verify-otp",
      "/two-factor/get-totp-uri",
    ]) {
      const res = await api(path, { body: { password: u.password, code: "123456" }, jar: u.jar });
      expect(res.status, path).toBe(404);
    }
  });
});

describe("sign-in challenge", () => {
  it("withholds the session until the second factor is verified", async () => {
    const u = await enrolledUser("mfa-signin");
    const { jar, res } = await firstFactor(u.email, u.password);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ twoFactorRedirect: true, twoFactorMethods: ["totp"] });
    expect(jar.get(sessionCookieName())).toBeUndefined();
    expect(jar.get(CHALLENGE_COOKIE)).toBeTruthy();
    expect((await api("/get-session", { jar })).body).toBeNull();
    expect(await hasMfaChallenge(headersFor(jar))).toBe(true);

    const wrong = await api("/two-factor/verify-totp", { body: { code: "123456" }, jar });
    expect(wrong.status).toBe(401);

    const ok = await api("/two-factor/verify-totp", {
      body: { code: totp(u.manualKey, 1) },
      jar,
    });
    expect(ok.status).toBe(200);
    expect(ok.body!.token).toBeNull();
    expect(jar.get(CHALLENGE_COOKIE)).toBeUndefined();
    const session = await api("/get-session", { jar });
    expect((session.body!.user as { id: string }).id).toBe(u.userId);

    const events = await auditFor(admin, u.userId);
    const tail = events.slice(-5).map((e) => e.action);
    expect(tail).toEqual(
      expect.arrayContaining([
        "auth.mfa.challenge_issued",
        "auth.mfa.failed",
        "auth.mfa.verified",
        "auth.login.succeeded",
      ]),
    );
    const failure = events.findLast((e) => e.action === "auth.mfa.failed")!;
    expect(failure).toMatchObject({ subject_user_id: u.userId, outcome: "failure" });
    expect(failure.metadata).toMatchObject({ method: "totp", stage: "sign_in" });
    const success = events.findLast((e) => e.action === "auth.login.succeeded")!;
    expect(success.metadata).toMatchObject({ secondFactor: "totp" });
    // The discarded password-only session is not reported as a revocation.
    const challengeAt = events.findIndex((e) => e.action === "auth.mfa.challenge_issued");
    expect(events.slice(challengeAt).filter((e) => e.action === "auth.session.revoked")).toEqual(
      [],
    );
  });

  it("accepts each authenticator code once (RFC 6238 replay protection)", async () => {
    const u = await enrolledUser("mfa-replay");
    const code = totp(u.manualKey, -1);
    const a = await firstFactor(u.email, u.password);
    expect((await api("/two-factor/verify-totp", { body: { code }, jar: a.jar })).status).toBe(200);

    const b = await firstFactor(u.email, u.password);
    const replay = await api("/two-factor/verify-totp", { body: { code }, jar: b.jar });
    expect(replay.status).toBe(401);
    expect((await api("/get-session", { jar: b.jar })).body).toBeNull();
    const events = await auditFor(admin, u.userId);
    expect(events.findLast((e) => e.action === "auth.mfa.failed")!.metadata).toMatchObject({
      reason: "CODE_REPLAYED",
    });
  });

  it("ends a challenge after five wrong codes", async () => {
    const u = await enrolledUser("mfa-attempts");
    const { jar } = await firstFactor(u.email, u.password);
    for (let i = 0; i < 5; i++) {
      const r = await api("/two-factor/verify-totp", { body: { code: `00000${i}` }, jar });
      expect(r.status).toBe(401);
    }
    const sixth = await api("/two-factor/verify-totp", {
      body: { code: totp(u.manualKey, 1) },
      jar,
    });
    expect(sixth.status).toBe(400);
    expect(sixth.body).toMatchObject({ code: "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE" });
    expect((await api("/get-session", { jar })).body).toBeNull();
  });

  it("locks the second factor after ten consecutive failures across challenges", async () => {
    const u = await enrolledUser("mfa-lock");
    for (let c = 0; c < 2; c++) {
      const { jar } = await firstFactor(u.email, u.password);
      for (let i = 0; i < 5; i++) {
        // Distinct wrong codes: a repeated code is rejected as a replay before it counts.
        await api("/two-factor/verify-totp", { body: { code: `${c}1111${i}` }, jar });
      }
    }
    const { jar } = await firstFactor(u.email, u.password);
    const locked = await api("/two-factor/verify-totp", {
      body: { code: totp(u.manualKey, 1) },
      jar,
    });
    expect(locked.status).toBe(429);
    const flow = await verifyMfaChallenge(
      { method: "totp", code: totp(u.manualKey, -1) },
      headersFor(jar),
    );
    expect(flow).toMatchObject({ ok: false, code: "MFA_LOCKED" });
  });

  it("refuses 'trust this device' and session-less verification", async () => {
    const u = await enrolledUser("mfa-trust");
    const { jar } = await firstFactor(u.email, u.password);
    for (const body of [
      { code: totp(u.manualKey, 1), trustDevice: true },
      { code: u.recoveryCodes[0], disableSession: true },
    ]) {
      const path =
        "trustDevice" in body ? "/two-factor/verify-totp" : "/two-factor/verify-backup-code";
      expect((await api(path, { body, jar })).status).toBe(400);
    }
    expect(jar.header()).not.toContain("trust_device");
  });

  it("rejects a forged or missing challenge cookie", async () => {
    const jar = new CookieJar();
    jar.set(CHALLENGE_COOKIE, "2fa-forged.c2lnbmF0dXJl");
    const res = await api("/two-factor/verify-totp", { body: { code: "123456" }, jar });
    expect(res.status).toBe(401);
    expect(
      await verifyMfaChallenge({ method: "totp", code: "123456" }, headersFor(new CookieJar())),
    ).toMatchObject({ ok: false, code: "MFA_CHALLENGE_EXPIRED" });
  });

  it("login flow reports that a second factor is required", async () => {
    const u = await enrolledUser("mfa-flow");
    const plain = await createVerifiedUser(t.mailbox, "no-mfa");
    const h = () => new Headers({ "x-forwarded-for": freshIp(), origin: "http://localhost:3000" });
    expect(await login({ email: u.email, password: u.password }, h())).toEqual({
      ok: true,
      data: { mfaRequired: true },
    });
    expect(await login({ email: plain.email, password: plain.password }, h())).toEqual({
      ok: true,
      data: { mfaRequired: false },
    });
  });
});

describe("recovery codes", () => {
  it("complete a sign-in once each, with a notice email", async () => {
    const u = await enrolledUser("mfa-recovery");
    const code = u.recoveryCodes[0]!;

    const a = await firstFactor(u.email, u.password);
    // The flow accepts the code without its hyphen and in any surrounding whitespace.
    const ok = await verifyMfaChallenge(
      { method: "recovery", code: ` ${code.replace("-", "")} ` },
      headersFor(a.jar),
    );
    expect(ok).toEqual({ ok: true, data: undefined });

    const b = await firstFactor(u.email, u.password);
    const reused = await api("/two-factor/verify-backup-code", { body: { code }, jar: b.jar });
    expect(reused.status).toBe(401);

    const events = await auditFor(admin, u.userId);
    const verified = events.findLast((e) => e.action === "auth.mfa.verified")!;
    expect(verified.metadata).toMatchObject({ method: "recovery_code", stage: "sign_in" });
    expect(JSON.stringify(events)).not.toContain(code);
    expect(
      t.mailbox.outbox.some(
        (m) => m.to === u.email && m.category === "auth.mfa-recovery-code-used",
      ),
    ).toBe(true);

    const second = await firstFactor(u.email, u.password);
    const viaHttp = await api("/two-factor/verify-backup-code", {
      body: { code: u.recoveryCodes[1] },
      jar: second.jar,
    });
    expect(viaHttp.status).toBe(200);
    expect(await getMfaStatus(headersFor(second.jar))).toEqual({
      enabled: true,
      recoveryCodesRemaining: 8,
    });
  });

  it("regenerating replaces every code and needs the password", async () => {
    const u = await enrolledUser("mfa-regen");
    const bad = await api("/two-factor/generate-backup-codes", {
      body: { password: "definitely-not-it" },
      jar: u.jar,
    });
    expect(bad.status).toBeGreaterThanOrEqual(400);

    const res = await api("/two-factor/generate-backup-codes", {
      body: { password: u.password },
      jar: u.jar,
    });
    expect(res.status).toBe(200);
    const fresh = res.body!.backupCodes as string[];
    expect(fresh).toHaveLength(10);

    const { jar } = await firstFactor(u.email, u.password);
    const old = await api("/two-factor/verify-backup-code", {
      body: { code: u.recoveryCodes[0] },
      jar,
    });
    expect(old.status).toBe(401);
    const neu = await api("/two-factor/verify-backup-code", { body: { code: fresh[0] }, jar });
    expect(neu.status).toBe(200);
    expect(await actions(u.userId)).toEqual(
      expect.arrayContaining(["auth.mfa.recovery_codes_regenerated", "auth.mfa.change_failed"]),
    );
  });
});

describe("turning MFA off", () => {
  it("needs the password and a recent sign-in", async () => {
    const u = await enrolledUser("mfa-disable");

    const wrong = await api("/two-factor/disable", {
      body: { password: "nope-nope-nope" },
      jar: u.jar,
    });
    expect(wrong.status).toBe(400);

    // A session older than the 15-minute freshness window must sign in again.
    await admin`update sessions set created_at = now() - interval '20 minutes'
                where user_id = ${u.userId}`;
    const stale = await api("/two-factor/disable", { body: { password: u.password }, jar: u.jar });
    expect(stale.status).toBe(403);
    expect(stale.body).toMatchObject({ code: "SESSION_NOT_FRESH" });
    await admin`update sessions set created_at = now() where user_id = ${u.userId}`;

    const ok = await api("/two-factor/disable", { body: { password: u.password }, jar: u.jar });
    expect(ok.status).toBe(200);
    const [user] = await admin`select two_factor_enabled from users where id = ${u.userId}`;
    expect(user!.two_factor_enabled).toBe(false);
    expect(await admin`select 1 from two_factors where user_id = ${u.userId}`).toHaveLength(0);
    expect((await api("/get-session", { jar: u.jar })).body).not.toBeNull();

    // Password alone signs in again.
    const again = await signIn(u.email, u.password);
    expect(again.jar.get(sessionCookieName())).toBeTruthy();

    expect(await actions(u.userId)).toEqual(
      expect.arrayContaining(["auth.mfa.change_failed", "auth.mfa.disabled"]),
    );
    expect(
      t.mailbox.outbox.some((m) => m.to === u.email && m.category === "auth.mfa-disabled"),
    ).toBe(true);
  });
});

describe("account recovery without MFA bypass", () => {
  it("a password reset keeps MFA on", async () => {
    const u = await enrolledUser("mfa-reset");
    await api("/request-password-reset", { body: { email: u.email } });
    const message = t.mailbox.outbox
      .filter((m) => m.to === u.email && m.category === "auth.reset-password")
      .at(-1);
    const token = decodeURIComponent(/[?&]token=([^\s&"'<]+)/.exec(message!.text)![1]!);
    const newPassword = "another-correct-horse-battery";
    expect((await api("/reset-password", { body: { token, newPassword } })).status).toBe(200);

    const { jar, res } = await firstFactor(u.email, newPassword);
    expect(res.body).toMatchObject({ twoFactorRedirect: true });
    expect(jar.get(sessionCookieName())).toBeUndefined();
  });
});
