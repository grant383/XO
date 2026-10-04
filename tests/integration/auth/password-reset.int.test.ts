import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools } from "@/platform/db";
import { TOKEN_POLICY } from "@/modules/identity";
import { adminSql } from "../../helpers/db";
import { auditFor } from "../../helpers/audit";
import {
  api,
  createVerifiedUser,
  installTestAuth,
  signIn,
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

const NEW_PASSWORD = "a-brand-new-long-passphrase";

describe("password reset request", () => {
  it("emails a single-use link for a known account and stores only a hash of the token", async () => {
    const u = await createVerifiedUser(t.mailbox, "reset-req");
    const res = await api("/request-password-reset", { body: { email: u.email } });

    expect(res.status).toBe(200);
    const token = tokenFromEmail(t.mailbox, u.email, "auth.reset-password");
    const mail = t.mailbox.outbox.filter(
      (m) => m.to === u.email && m.category === "auth.reset-password",
    );
    expect(mail[0]!.text).toContain("http://localhost:3000/auth/reset-password?token=");

    const rows =
      await admin`select identifier, value, expires_at from verifications where value = ${u.userId}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.identifier).not.toContain(token);
    const ttl = (new Date(rows[0]!.expires_at).getTime() - Date.now()) / 1000;
    expect(ttl).toBeGreaterThan(TOKEN_POLICY.passwordResetTtlSec - 60);
    expect(ttl).toBeLessThanOrEqual(TOKEN_POLICY.passwordResetTtlSec);

    const events = await auditFor(admin, u.userId);
    expect(events.map((e) => e.action)).toContain("auth.password_reset.requested");
  });

  it("gives an unknown address the identical response and sends nothing", async () => {
    const u = await createVerifiedUser(t.mailbox, "reset-known");
    const ghost = uniqueEmail("ghost");
    const known = await api("/request-password-reset", { body: { email: u.email } });
    const unknown = await api("/request-password-reset", { body: { email: ghost } });

    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    expect(t.mailbox.outbox.filter((m) => m.to === ghost)).toHaveLength(0);
  });
});

describe("password reset", () => {
  it("rejects an invalid token", async () => {
    const res = await api("/reset-password", {
      body: { token: "definitely-not-a-real-token", newPassword: NEW_PASSWORD },
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "INVALID_TOKEN" });
    const [row] = await admin`select count(*)::int as n from audit_log
                              where action = 'auth.password_reset.failed' and metadata->>'reason' = 'INVALID_TOKEN'`;
    expect(row!.n).toBeGreaterThan(0);
  });

  it("rejects an expired token and leaves the password unchanged", async () => {
    const u = await createVerifiedUser(t.mailbox, "reset-expired");
    await api("/request-password-reset", { body: { email: u.email } });
    const token = tokenFromEmail(t.mailbox, u.email, "auth.reset-password");
    await admin`update verifications set expires_at = now() - interval '1 second' where value = ${u.userId}`;

    const res = await api("/reset-password", { body: { token, newPassword: NEW_PASSWORD } });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "INVALID_TOKEN" });
    expect((await signIn(u.email, u.password)).res.status).toBe(200);
    expect((await signIn(u.email, NEW_PASSWORD)).res.status).toBe(401);
  });

  it("rejects a weak replacement password without consuming the token", async () => {
    const u = await createVerifiedUser(t.mailbox, "reset-weak");
    await api("/request-password-reset", { body: { email: u.email } });
    const token = tokenFromEmail(t.mailbox, u.email, "auth.reset-password");
    const weak = await api("/reset-password", { body: { token, newPassword: "short" } });
    expect(weak.status).toBe(400);
    expect(weak.body).toMatchObject({ code: "PASSWORD_TOO_SHORT" });
    expect(
      (await api("/reset-password", { body: { token, newPassword: NEW_PASSWORD } })).status,
    ).toBe(200);
  });

  it("sets the new password, revokes every existing session and cannot be replayed", async () => {
    const u = await createVerifiedUser(t.mailbox, "reset-ok");
    const laptop = await signIn(u.email, u.password);
    const phone = await signIn(u.email, u.password);
    expect(await admin`select 1 from sessions where user_id = ${u.userId}`).toHaveLength(2);

    await api("/request-password-reset", { body: { email: u.email } });
    const token = tokenFromEmail(t.mailbox, u.email, "auth.reset-password");
    const res = await api("/reset-password", { body: { token, newPassword: NEW_PASSWORD } });
    expect(res.status).toBe(200);

    expect(await admin`select 1 from sessions where user_id = ${u.userId}`).toHaveLength(0);
    expect((await api("/get-session", { jar: laptop.jar })).body).toBeNull();
    expect((await api("/get-session", { jar: phone.jar })).body).toBeNull();

    expect((await signIn(u.email, u.password)).res.status).toBe(401);
    expect((await signIn(u.email, NEW_PASSWORD)).res.status).toBe(200);

    const replay = await api("/reset-password", {
      body: { token, newPassword: "yet-another-passphrase" },
    });
    expect(replay.status).toBe(400);
    expect(replay.body).toMatchObject({ code: "INVALID_TOKEN" });
    expect(await admin`select 1 from verifications where value = ${u.userId}`).toHaveLength(0);

    const events = await auditFor(admin, u.userId);
    const actions = events.map((e) => e.action);
    expect(actions).toContain("auth.password_reset.completed");
    const revoked = events.filter((e) => e.action === "auth.session.revoked");
    expect(revoked).toHaveLength(2);
    for (const r of revoked) expect(r.metadata).toEqual({ reason: "password_reset" });
  });

  it("invalidates older reset links once a newer one is used", async () => {
    const u = await createVerifiedUser(t.mailbox, "reset-multi");
    await api("/request-password-reset", { body: { email: u.email } });
    const first = tokenFromEmail(t.mailbox, u.email, "auth.reset-password");
    await api("/request-password-reset", { body: { email: u.email } });
    const second = tokenFromEmail(t.mailbox, u.email, "auth.reset-password");
    expect(first).not.toBe(second);

    expect(
      (await api("/reset-password", { body: { token: second, newPassword: NEW_PASSWORD } })).status,
    ).toBe(200);
    const stale = await api("/reset-password", {
      body: { token: first, newPassword: "first-link-passphrase" },
    });
    expect(stale.status).toBe(400);
    expect(stale.body).toMatchObject({ code: "INVALID_TOKEN" });
    expect((await signIn(u.email, NEW_PASSWORD)).res.status).toBe(200);
  });
});
