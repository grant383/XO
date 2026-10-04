import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools } from "@/platform/db";
import { getSession, SESSION_POLICY } from "@/modules/identity";
import { adminSql } from "../../helpers/db";
import { auditFor } from "../../helpers/audit";
import {
  api,
  CookieJar,
  createVerifiedUser,
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

const sessionIdOf = async (jar: CookieJar) =>
  ((await api("/get-session", { jar })).body?.session as { id: string } | undefined)?.id;

describe("login", () => {
  it("issues a signed HttpOnly SameSite=Lax session cookie backed by a database session", async () => {
    const u = await createVerifiedUser(t.mailbox, "login");
    const { jar, res } = await signIn(u.email, u.password);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ token: null, user: { id: u.userId } });

    const cookie = res.setCookies.find((c) => c.startsWith(`${sessionCookieName()}=`))!;
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).toMatch(/;\s*SameSite=Lax/i);
    expect(cookie).toMatch(/;\s*Path=\//i);
    expect(cookie).toMatch(/;\s*Max-Age=\d+/i);

    const session = await api("/get-session", { jar });
    expect(session.body).toMatchObject({ user: { id: u.userId } });
    expect(JSON.stringify(session.body)).not.toMatch(/"token":"/);

    const rows = await admin`select id, expires_at from sessions where user_id = ${u.userId}`;
    expect(rows).toHaveLength(1);
    const ttl = (new Date(rows[0]!.expires_at).getTime() - Date.now()) / 1000;
    expect(ttl).toBeGreaterThan(SESSION_POLICY.idleTimeoutSec - 60);
    expect(ttl).toBeLessThanOrEqual(SESSION_POLICY.idleTimeoutSec);

    const events = await auditFor(admin, u.userId);
    expect(events.find((e) => e.action === "auth.login.succeeded")).toMatchObject({
      actor_type: "user",
      actor_user_id: u.userId,
      target_type: "session",
      target_id: rows[0]!.id,
    });
  });

  it("returns an identical generic error for a wrong password and an unknown account", async () => {
    const u = await createVerifiedUser(t.mailbox, "invalid");
    const wrong = await signIn(u.email, "not-the-right-password");
    const unknown = await signIn(uniqueEmail("ghost"), "not-the-right-password");

    expect(wrong.res.status).toBe(401);
    expect(unknown.res.status).toBe(401);
    expect(wrong.res.body).toEqual(unknown.res.body);
    expect(wrong.res.body).toEqual({
      code: "INVALID_EMAIL_OR_PASSWORD",
      message: "Invalid email or password",
    });
    expect(wrong.res.setCookies.filter((c) => c.includes("session_token"))).toEqual([]);
    expect(await admin`select 1 from sessions where user_id = ${u.userId}`).toHaveLength(0);

    const failures = await admin`select actor_type, outcome, metadata from audit_log
      where action = 'auth.login.failed' and metadata->>'reason' = 'invalid_credentials'
      order by occurred_at desc limit 2`;
    expect(failures).toHaveLength(2);
    for (const f of failures)
      expect(f).toMatchObject({ actor_type: "anonymous", outcome: "failure" });
  });

  it("uses Secure, __Secure- prefixed cookies when configured for TLS (production)", async () => {
    const secure = installTestAuth({ secureCookies: true });
    try {
      const u = await createVerifiedUser(secure.mailbox, "secure");
      const { res } = await signIn(u.email, u.password);
      const cookie = res.setCookies.find((c) => c.startsWith(`${sessionCookieName(true)}=`));
      expect(cookie).toBeDefined();
      expect(cookie).toMatch(/;\s*Secure/i);
      expect(cookie).toMatch(/;\s*HttpOnly/i);
      expect(cookie).toMatch(/;\s*SameSite=Lax/i);
    } finally {
      t = installTestAuth();
    }
  });

  it("does not accept the raw session token as a bearer token or as an unsigned cookie", async () => {
    const u = await createVerifiedUser(t.mailbox, "bearer");
    await signIn(u.email, u.password);
    const [row] = await admin`select token from sessions where user_id = ${u.userId}`;
    const raw = String(row!.token);

    const bearer = await api("/get-session", { headers: { authorization: `Bearer ${raw}` } });
    expect(bearer.body).toBeNull();

    const unsigned = new CookieJar();
    unsigned.set(sessionCookieName(), raw);
    expect((await api("/get-session", { jar: unsigned })).body).toBeNull();
  });

  it("rejects cross-site POSTs carrying the session cookie (CSRF)", async () => {
    const u = await createVerifiedUser(t.mailbox, "csrf");
    const { jar } = await signIn(u.email, u.password);
    const res = await api("/sign-out", { body: {}, jar, origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(await sessionIdOf(jar)).toBeDefined();
  });
});

describe("logout", () => {
  it("deletes the database session, clears the cookie and is audited", async () => {
    const u = await createVerifiedUser(t.mailbox, "logout");
    const { jar } = await signIn(u.email, u.password);
    const stolen = jar.clone();
    const sessionId = await sessionIdOf(jar);

    const res = await api("/sign-out", { body: {}, jar });
    expect(res.status).toBe(200);
    expect(res.setCookies.find((c) => c.startsWith(`${sessionCookieName()}=`))).toMatch(
      /Max-Age=0/i,
    );

    expect(await admin`select 1 from sessions where id = ${sessionId!}`).toHaveLength(0);
    // A copy of the old cookie is useless once the session is revoked server-side.
    expect((await api("/get-session", { jar: stolen })).body).toBeNull();

    const events = await auditFor(admin, u.userId);
    expect(events.find((e) => e.action === "auth.logout")).toMatchObject({
      actor_user_id: u.userId,
      target_id: sessionId,
    });
  });
});

describe("session lifecycle", () => {
  it("issues a new session token on every sign-in and ignores pre-set cookies (no fixation)", async () => {
    const u = await createVerifiedUser(t.mailbox, "rotate");
    const fixed = new CookieJar();
    fixed.set(sessionCookieName(), "attacker-chosen-value.signature");
    await api("/sign-in/email", { body: { email: u.email, password: u.password }, jar: fixed });
    const second = await signIn(u.email, u.password);

    const tokens = await admin`select token from sessions where user_id = ${u.userId}`;
    expect(tokens).toHaveLength(2);
    expect(new Set(tokens.map((r) => r.token)).size).toBe(2);
    expect(fixed.get(sessionCookieName())).not.toBe("attacker-chosen-value.signature");
    expect(fixed.get(sessionCookieName())).not.toBe(second.jar.get(sessionCookieName()));
  });

  it("expires sessions past their idle timeout and deletes them", async () => {
    const u = await createVerifiedUser(t.mailbox, "expiry");
    const { jar } = await signIn(u.email, u.password);
    const sessionId = (await sessionIdOf(jar))!;
    await admin`update sessions set expires_at = now() - interval '1 second' where id = ${sessionId}`;

    expect((await api("/get-session", { jar })).body).toBeNull();
    expect(await admin`select 1 from sessions where id = ${sessionId}`).toHaveLength(0);
    const events = await auditFor(admin, u.userId);
    expect(events.map((e) => e.action)).toContain("auth.session.expired");
  });

  it("slides the idle expiry on use but never beyond the absolute lifetime", async () => {
    const u = await createVerifiedUser(t.mailbox, "absolute");
    const { jar } = await signIn(u.email, u.password);
    const sessionId = (await sessionIdOf(jar))!;
    // Signed in 29.5 days ago; due for refresh.
    await admin`update sessions set created_at = now() - interval '29 days 12 hours',
                                     expires_at = now() + interval '1 hour'
                where id = ${sessionId}`;

    expect((await api("/get-session", { jar })).body).not.toBeNull();
    const [row] = await admin`select created_at, expires_at from sessions where id = ${sessionId}`;
    const cap = new Date(row!.created_at).getTime() + SESSION_POLICY.absoluteLifetimeSec * 1000;
    expect(new Date(row!.expires_at).getTime()).toBeLessThanOrEqual(cap);
    expect(new Date(row!.expires_at).getTime()).toBeGreaterThan(Date.now() + 60 * 60 * 1000);
  });

  it("server-side getSession rejects sessions beyond the absolute lifetime and revokes them", async () => {
    const u = await createVerifiedUser(t.mailbox, "absolute2");
    const { jar } = await signIn(u.email, u.password);
    const sessionId = (await sessionIdOf(jar))!;
    const headers = new Headers({ cookie: jar.header() });
    expect(await getSession(headers)).toMatchObject({ userId: u.userId, sessionId });

    await admin`update sessions set created_at = now() - interval '31 days' where id = ${sessionId}`;
    expect(await getSession(headers)).toBeNull();
    expect(await admin`select 1 from sessions where id = ${sessionId}`).toHaveLength(0);
  });

  it("revokes other sessions on request, keeping the current one", async () => {
    const u = await createVerifiedUser(t.mailbox, "revoke");
    const laptop = await signIn(u.email, u.password);
    const phone = await signIn(u.email, u.password);

    const res = await api("/revoke-other-sessions", { body: {}, jar: laptop.jar });
    expect(res.status).toBe(200);
    expect(await sessionIdOf(laptop.jar)).toBeDefined();
    expect(await sessionIdOf(phone.jar)).toBeUndefined();

    const revoked = (await auditFor(admin, u.userId)).filter(
      (e) => e.action === "auth.session.revoked",
    );
    expect(revoked).toHaveLength(1);
    expect(revoked[0]).toMatchObject({
      actor_user_id: u.userId,
      metadata: { reason: "user_request" },
    });
  });

  it("revokes every session when requested, including the caller's", async () => {
    const u = await createVerifiedUser(t.mailbox, "revoke-all");
    const a = await signIn(u.email, u.password);
    const b = await signIn(u.email, u.password);
    expect((await api("/revoke-sessions", { body: {}, jar: a.jar })).status).toBe(200);
    expect(await sessionIdOf(a.jar)).toBeUndefined();
    expect(await sessionIdOf(b.jar)).toBeUndefined();
    expect(await admin`select 1 from sessions where user_id = ${u.userId}`).toHaveLength(0);
  });

  it("never returns session tokens to the browser, including from list-sessions", async () => {
    const u = await createVerifiedUser(t.mailbox, "list");
    const { jar } = await signIn(u.email, u.password);
    await signIn(u.email, u.password);
    const res = await api("/list-sessions", { jar });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.text).not.toMatch(/"token":"/);
    const [row] = await admin`select token from sessions where user_id = ${u.userId} limit 1`;
    expect(res.text).not.toContain(String(row!.token));
  });

  it("propagates a correlation id to the response and the audit record", async () => {
    const u = await createVerifiedUser(t.mailbox, "correlate");
    const correlationId = `test-corr-${u.userId.slice(0, 8)}`;
    const res = await api("/sign-in/email", {
      body: { email: u.email, password: u.password },
      headers: { "x-correlation-id": correlationId },
    });
    expect(res.headers.get("x-correlation-id")).toBe(correlationId);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const login = (await auditFor(admin, u.userId)).find(
      (e) => e.action === "auth.login.succeeded",
    );
    expect(login?.correlation_id).toBe(correlationId);

    const generated = await api("/get-session", {});
    expect(generated.headers.get("x-correlation-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("disables unused Better Auth endpoints", async () => {
    const u = await createVerifiedUser(t.mailbox, "disabled");
    const { jar } = await signIn(u.email, u.password);
    for (const path of [
      "/list-accounts",
      "/update-session",
      "/delete-user",
      "/change-email",
      "/sign-in/social",
    ]) {
      const res = await api(path, { body: {}, jar });
      expect(res.status, path).toBe(404);
    }
  });
});
