import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools } from "@/platform/db";
import {
  getProfile,
  listSessions,
  register,
  requestPasswordReset,
  revokeSession,
  UnauthenticatedError,
  updateName,
} from "@/modules/identity";
import { adminSql } from "../../helpers/db";
import { auditFor } from "../../helpers/audit";
import {
  api,
  createVerifiedUser,
  freshIp,
  installTestAuth,
  sessionCookieName,
  signIn,
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

const headersFor = (jarHeader: string) =>
  new Headers({ cookie: jarHeader, "x-forwarded-for": freshIp(), origin: "http://localhost:3000" });

describe("profile identity foundation", () => {
  it("reads the signed-in user's profile through the RLS-governed runtime role", async () => {
    const u = await createVerifiedUser(t.mailbox, "profile");
    const { jar } = await signIn(u.email, u.password);
    const profile = await getProfile(headersFor(jar.header()));
    expect(profile).toMatchObject({
      id: u.userId,
      email: u.email,
      name: u.name,
      emailVerified: true,
    });
  });

  it("requires an authenticated session", async () => {
    await expect(getProfile(new Headers())).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("updates the display name only, with an audit record", async () => {
    const u = await createVerifiedUser(t.mailbox, "rename");
    const { jar } = await signIn(u.email, u.password);
    const res = await updateName({ name: "  Grace Operator  " }, headersFor(jar.header()));
    expect(res).toEqual({ ok: true, data: undefined });
    const [row] = await admin`select name from users where id = ${u.userId}`;
    expect(row!.name).toBe("Grace Operator");
    expect((await auditFor(admin, u.userId)).map((e) => e.action)).toContain(
      "auth.profile.updated",
    );

    expect(await updateName({ name: "" }, headersFor(jar.header()))).toMatchObject({
      ok: false,
      code: "VALIDATION",
    });
  });

  it("refuses to change email, verification status or image through the identity API", async () => {
    const u = await createVerifiedUser(t.mailbox, "protected");
    const { jar } = await signIn(u.email, u.password);
    for (const body of [
      { name: "x", email: "hijack@example.test" },
      { image: "https://tracker.example/pixel.gif" },
      { name: "x", emailVerified: false },
    ]) {
      const res = await api("/update-user", { body, jar });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    const [row] =
      await admin`select email, image, email_verified from users where id = ${u.userId}`;
    expect(row).toMatchObject({ email: u.email, image: null, email_verified: true });
  });

  it("rejects unauthenticated profile updates", async () => {
    const res = await api("/update-user", { body: { name: "Nobody" } });
    expect(res.status).toBe(401);
  });
});

describe("session management", () => {
  it("lists sessions without exposing tokens and revokes one by id (owner only)", async () => {
    const u = await createVerifiedUser(t.mailbox, "devices");
    const laptop = await signIn(u.email, u.password);
    const phone = await signIn(u.email, u.password);
    const other = await createVerifiedUser(t.mailbox, "other-user");
    const otherSession = await signIn(other.email, other.password);

    const sessions = await listSessions(headersFor(laptop.jar.header()));
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s) => s.current)).toHaveLength(1);
    expect(JSON.stringify(sessions)).not.toMatch(/token/i);

    const [otherRow] = await admin`select id from sessions where user_id = ${other.userId}`;
    const cross = await revokeSession(String(otherRow!.id), headersFor(laptop.jar.header()));
    expect(cross).toMatchObject({ ok: false, code: "VALIDATION" });
    expect((await api("/get-session", { jar: otherSession.jar })).body).not.toBeNull();

    const phoneId = sessions.find((s) => !s.current)!.id;
    expect(await revokeSession(phoneId, headersFor(laptop.jar.header()))).toEqual({
      ok: true,
      data: undefined,
    });
    expect((await api("/get-session", { jar: phone.jar })).body).toBeNull();
    expect((await api("/get-session", { jar: laptop.jar })).body).not.toBeNull();
  });

  it("lists and revokes devices for a session older than the freshness window", async () => {
    const u = await createVerifiedUser(t.mailbox, "old-session");
    const laptop = await signIn(u.email, u.password);
    const phone = await signIn(u.email, u.password);
    // Better Auth's /list-sessions refuses sessions older than 15 minutes; device
    // management must keep working for a long-lived (up to 30-day) session.
    await admin`update sessions set created_at = now() - interval '3 days' where user_id = ${u.userId}`;

    const sessions = await listSessions(headersFor(laptop.jar.header()));
    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.lastActiveAt).toBeInstanceOf(Date);
    expect(await revokeSession("not-a-uuid", headersFor(laptop.jar.header()))).toMatchObject({
      ok: false,
      code: "VALIDATION",
    });
    const phoneId = sessions.find((s) => !s.current)!.id;
    expect(await revokeSession(phoneId, headersFor(laptop.jar.header()))).toMatchObject({
      ok: true,
    });
    expect((await api("/get-session", { jar: phone.jar })).body).toBeNull();
    const revoked = (await auditFor(admin, u.userId)).findLast(
      (e) => e.action === "auth.session.revoked",
    );
    expect(revoked).toMatchObject({ target_id: phoneId, metadata: { reason: "user_request" } });
  });

  it("changing the password revokes all other sessions, rotates the current one and notifies the user", async () => {
    const u = await createVerifiedUser(t.mailbox, "change-pw");
    const current = await signIn(u.email, u.password);
    const other = await signIn(u.email, u.password);
    const before = current.jar.get(sessionCookieName());

    const res = await api("/change-password", {
      body: {
        currentPassword: u.password,
        newPassword: "a-changed-passphrase-1",
        revokeOtherSessions: true,
      },
      jar: current.jar,
    });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/"token":"[^"]/);
    expect(current.jar.get(sessionCookieName())).not.toBe(before);
    expect((await api("/get-session", { jar: current.jar })).body).not.toBeNull();
    expect((await api("/get-session", { jar: other.jar })).body).toBeNull();

    const actions = (await auditFor(admin, u.userId)).map((e) => e.action);
    expect(actions).toContain("auth.password.changed");
    expect(
      t.mailbox.outbox.some((m) => m.to === u.email && m.category === "auth.password-changed"),
    ).toBe(true);

    const wrong = await api("/change-password", {
      body: { currentPassword: "not-the-password", newPassword: "another-passphrase-2" },
      jar: current.jar,
    });
    expect(wrong.status).toBe(400);
    expect((await auditFor(admin, u.userId)).map((e) => e.action)).toContain(
      "auth.password.change_failed",
    );
  });
});

describe("server action flows", () => {
  it("validate input server-side and return non-enumerating results", async () => {
    const h = () => new Headers({ "x-forwarded-for": freshIp() });
    expect(
      await register({ name: "A", email: "not-an-email", password: "short" }, h()),
    ).toMatchObject({
      ok: false,
      code: "VALIDATION",
      fieldErrors: { email: expect.any(String), password: expect.any(String) },
    });
    const u = await createVerifiedUser(t.mailbox, "flows");
    expect(
      await register({ name: "A", email: u.email, password: "long-enough-password" }, h()),
    ).toEqual({
      ok: true,
      data: undefined,
    });
    expect(await requestPasswordReset({ email: uniqueEmail("nobody") }, h())).toEqual({
      ok: true,
      data: undefined,
    });
  });
});
