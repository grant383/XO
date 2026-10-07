import type { Sql } from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { closePools } from "@/platform/db";
import type { MemoryTransport } from "@/platform/email";
import { logger } from "@/platform/observability/logger";
import { register } from "@/modules/identity";
import {
  acceptInvitation,
  createInvitation,
  getTeam,
  previewInvitation,
  revokeInvitation,
} from "@/modules/memberships";
import { resolveSelectedVenture, VenturePermissionError } from "@/modules/ventures";
import { adminSql } from "../../helpers/db";
import {
  api,
  APP_URL,
  freshIp,
  installTestAuth,
  settleEmail,
  STRONG_PASSWORD,
  tokenFromEmail,
  uniqueEmail,
  uninstallTestAuth,
} from "../../helpers/auth";
import {
  activeVenture,
  actor,
  backdateInvitation,
  membershipOf,
  ventureAudit,
} from "../../helpers/memberships";

let admin: Sql;
let mailbox: MemoryTransport;

beforeAll(() => {
  admin = adminSql();
  ({ mailbox } = installTestAuth());
});
afterEach(async () => {
  vi.restoreAllMocks();
  await settleEmail();
});
afterAll(async () => {
  uninstallTestAuth();
  await closePools();
  await admin.end();
});

const venture = () =>
  activeVenture(admin, { owner: "owner", admin: "admin", manager: "manager", viewer: "viewer" });

/** The raw token from the most recent invitation email to `to`. */
function invitationTokenFor(to: string) {
  const message = mailbox.outbox
    .filter((m) => m.to === to && m.category === "team.invitation")
    .at(-1);
  if (!message) throw new Error(`No invitation email for ${to}`);
  const match = /\/invite\/([A-Za-z0-9_-]{43})/.exec(message.text);
  if (!match) throw new Error("No invitation link in email");
  return match[1]!;
}

async function invite(
  from: { userId: string; correlationId?: string },
  ventureId: string,
  email: string,
  role = "operator",
) {
  const res = await createInvitation(from, ventureId, { email, role });
  if (!res.ok) throw new Error(`${res.code}: ${res.message}`);
  return { invitationId: res.data.invitationId, token: invitationTokenFor(email.toLowerCase()) };
}

describe("creating invitations", () => {
  it("stores a pending invitation, emails a single-use link and audits without the token", async () => {
    const { ventureId, people } = await venture();
    const invitee = uniqueEmail("new");
    const res = await createInvitation(people.admin, ventureId, {
      email: `  ${invitee.toUpperCase()} `,
      role: "manager",
    });
    expect(res).toMatchObject({ ok: true, data: { emailSent: true } });
    const token = invitationTokenFor(invitee);

    const [row] = await admin`select email, role, status, invited_by, token_hash, expires_at
                              from venture_invitations where venture_id = ${ventureId}`;
    expect(row).toMatchObject({
      email: invitee,
      role: "manager",
      status: "pending",
      invited_by: people.admin.userId,
    });
    expect(row!.token_hash).not.toBe(token);
    const ttl = new Date(row!.expires_at).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(6.9 * 86_400_000);
    expect(ttl).toBeLessThanOrEqual(7 * 86_400_000);

    const message = mailbox.outbox.at(-1)!;
    expect(message.text).toContain(`${APP_URL}/invite/${token}`);
    expect(message.subject).toContain("invited you to");

    const audit = await ventureAudit(admin, ventureId);
    expect(audit).toEqual([
      expect.objectContaining({
        action: "venture.invitation.created",
        actor_user_id: people.admin.userId,
        target_type: "invitation",
        metadata: expect.objectContaining({ role: "manager" }),
      }),
    ]);
    const invitations = JSON.stringify(
      await admin`select * from venture_invitations where venture_id = ${ventureId}`,
    );
    expect(invitations).not.toContain(token);
    expect(JSON.stringify(audit)).not.toContain(token);
    expect(JSON.stringify(audit)).not.toContain(invitee); // no email addresses in audit metadata
  });

  it("refuses duplicates, existing members, unassignable roles and invalid input", async () => {
    const { ventureId, people } = await venture();
    const email = uniqueEmail("dup");
    await invite(people.owner, ventureId, email);
    expect(
      await createInvitation(people.owner, ventureId, { email, role: "viewer" }),
    ).toMatchObject({ ok: false, code: "DUPLICATE" });
    expect(
      await createInvitation(people.owner, ventureId, {
        email: people.viewer.email,
        role: "viewer",
      }),
    ).toMatchObject({ ok: false, code: "ALREADY_MEMBER" });
    expect(
      await createInvitation(people.admin, ventureId, { email: uniqueEmail("a"), role: "admin" }),
    ).toMatchObject({ ok: false, code: "NOT_PERMITTED" });
    for (const input of [
      { email: uniqueEmail("o"), role: "owner" },
      { email: "nope", role: "viewer" },
      { email: uniqueEmail("m"), role: "member" },
    ]) {
      expect(await createInvitation(people.owner, ventureId, input)).toMatchObject({
        ok: false,
        code: "VALIDATION",
      });
    }
    const [{ n }] = (await admin`select count(*)::int as n from venture_invitations
                                 where venture_id = ${ventureId}`) as unknown as [{ n: number }];
    expect(n).toBe(1);
  });

  it("refuses non-admins and lets the Owner invite Admins", async () => {
    const { ventureId, people } = await venture();
    for (const who of [people.manager, people.viewer]) {
      await expect(
        createInvitation(who, ventureId, { email: uniqueEmail("x"), role: "viewer" }),
      ).rejects.toBeInstanceOf(VenturePermissionError);
    }
    expect(
      (
        await createInvitation(people.owner, ventureId, {
          email: uniqueEmail("adm"),
          role: "admin",
        })
      ).ok,
    ).toBe(true);
  });

  it("expires lapsed invitations so the address can be invited again", async () => {
    const { ventureId, people } = await venture();
    const email = uniqueEmail("lapsed");
    const first = await invite(people.owner, ventureId, email);
    await backdateInvitation(admin, first.invitationId);

    const invitee = await actor(admin, "lapsed-user");
    await admin`update users set email = ${email} where id = ${invitee.userId}`;
    expect(await previewInvitation(invitee, first.token)).toEqual({ state: "expired" });
    expect(await acceptInvitation(invitee, first.token)).toMatchObject({
      ok: false,
      code: "EXPIRED",
    });

    const second = await invite(people.owner, ventureId, email);
    const [old] =
      await admin`select status from venture_invitations where id = ${first.invitationId}`;
    expect(old!.status).toBe("expired");
    expect((await acceptInvitation(invitee, second.token)).ok).toBe(true);
    expect((await ventureAudit(admin, ventureId)).map((a) => a.action)).toContain(
      "venture.invitation.expired",
    );
  });
});

describe("revoking invitations", () => {
  it("revokes a pending invitation; its link then fails", async () => {
    const { ventureId, people } = await venture();
    const invitee = await actor(admin, "revoked");
    const { invitationId, token } = await invite(people.owner, ventureId, invitee.email);

    expect(await revokeInvitation(people.admin, ventureId, invitationId)).toEqual({
      ok: true,
      data: undefined,
    });
    expect(await revokeInvitation(people.admin, ventureId, invitationId)).toMatchObject({
      ok: false,
      code: "INVALID_STATE",
    });
    expect(await previewInvitation(invitee, token)).toEqual({ state: "invalid" });
    expect(await acceptInvitation(invitee, token)).toMatchObject({ ok: false, code: "INVALID" });
    expect(await membershipOf(admin, ventureId, invitee.userId)).toBeUndefined();
    expect((await ventureAudit(admin, ventureId)).map((a) => a.action)).toContain(
      "venture.invitation.revoked",
    );
  });

  it("stops Admins revoking Admin invitations and blocks cross-venture revocation", async () => {
    const a = await venture();
    const b = await venture();
    const adminInvite = await invite(a.people.owner, a.ventureId, uniqueEmail("ai"), "admin");
    expect(
      await revokeInvitation(a.people.admin, a.ventureId, adminInvite.invitationId),
    ).toMatchObject({ ok: false, code: "NOT_PERMITTED" });
    const bInvite = await invite(b.people.owner, b.ventureId, uniqueEmail("bi"));
    expect(await revokeInvitation(a.people.owner, a.ventureId, bInvite.invitationId)).toMatchObject(
      {
        ok: false,
        code: "NOT_FOUND",
      },
    );
    const [row] =
      await admin`select status from venture_invitations where id = ${bInvite.invitationId}`;
    expect(row!.status).toBe("pending");
    await expect(
      revokeInvitation(a.people.owner, b.ventureId, bInvite.invitationId),
    ).rejects.toThrow();
  });
});

describe("accepting invitations", () => {
  it("attaches an existing user atomically with audit records; replay fails", async () => {
    const { ventureId, people } = await venture();
    const invitee = await actor(admin, "existing");
    const { invitationId, token } = await invite(
      people.admin,
      ventureId,
      invitee.email,
      "operator",
    );

    expect(await previewInvitation(invitee, token)).toMatchObject({
      state: "valid",
      ventureId,
      role: "operator",
      inviterName: "admin",
    });
    expect(await acceptInvitation(invitee, token)).toEqual({ ok: true, ventureId });
    await expect(resolveSelectedVenture(invitee, ventureId)).resolves.toMatchObject({
      role: "operator",
    });
    const audit = (await ventureAudit(admin, ventureId)).filter(
      (a) => a.actor_user_id === invitee.userId,
    );
    expect(audit.map((a) => a.action).sort()).toEqual([
      "venture.invitation.accepted",
      "venture.membership.created",
    ]);
    expect(audit.find((a) => a.action === "venture.invitation.accepted")).toMatchObject({
      target_id: invitationId,
      correlation_id: invitee.correlationId,
    });

    expect(await acceptInvitation(invitee, token)).toMatchObject({ ok: false, code: "INVALID" });
    const [{ n }] = (await admin`select count(*)::int as n from venture_memberships
                                 where venture_id = ${ventureId} and user_id = ${invitee.userId}`) as unknown as [
      { n: number },
    ];
    expect(n).toBe(1);
    const failures = await admin`select metadata from audit_log
                                 where actor_user_id = ${invitee.userId} and venture_id is null
                                   and action = 'venture.invitation.accept_failed'`;
    expect(failures).toEqual([{ metadata: { reason: "INVALID" } }]);
  });

  it("refuses the wrong account and leaves the invitation usable by the right one", async () => {
    const { ventureId, people } = await venture();
    const invitee = await actor(admin, "right");
    const intruder = await actor(admin, "wrong");
    const { token } = await invite(people.owner, ventureId, invitee.email);

    expect(await previewInvitation(intruder, token)).toEqual({ state: "wrong_account" });
    expect(await acceptInvitation(intruder, token)).toMatchObject({
      ok: false,
      code: "WRONG_ACCOUNT",
    });
    expect(await membershipOf(admin, ventureId, intruder.userId)).toBeUndefined();
    expect((await acceptInvitation(invitee, token)).ok).toBe(true);
  });

  it("cannot be used against another venture: the token binds venture and role", async () => {
    const a = await venture();
    const b = await venture();
    const invitee = await actor(admin, "bound");
    const { token } = await invite(a.people.admin, a.ventureId, invitee.email, "viewer");
    expect(await acceptInvitation(invitee, token)).toEqual({ ok: true, ventureId: a.ventureId });
    expect(await membershipOf(admin, b.ventureId, invitee.userId)).toBeUndefined();
    expect((await membershipOf(admin, a.ventureId, invitee.userId))!.role).toBe("viewer");
    // An Admin of A cannot see or manage B's team through the invitee either.
    await expect(getTeam(a.people.admin, b.ventureId)).rejects.toThrow();
  });

  it("rejects malformed tokens without touching the database state", async () => {
    const invitee = await actor(admin, "malformed");
    for (const bad of ["", "short", "../../etc", 42, null]) {
      expect(await acceptInvitation(invitee, bad)).toMatchObject({ ok: false, code: "INVALID" });
      expect(await previewInvitation(invitee, bad)).toEqual({ state: "invalid" });
    }
  });

  it("never writes the raw token to logs", async () => {
    const { ventureId, people } = await venture();
    const invitee = await actor(admin, "logs");
    const lines: string[] = [];
    for (const level of ["info", "warn", "error", "debug"] as const) {
      vi.spyOn(logger, level).mockImplementation(((...args: unknown[]) => {
        lines.push(JSON.stringify(args));
      }) as never);
    }
    const { token } = await invite(people.owner, ventureId, invitee.email);
    await acceptInvitation(invitee, token);
    await acceptInvitation(invitee, token); // failure path logs/audits too
    expect(lines.length).toBeGreaterThan(0); // email delivery is logged
    expect(lines.join("\n")).not.toContain(token);
  });

  it("carries the invitation through registration and email verification for a new user", async () => {
    const { ventureId, people } = await venture();
    const email = uniqueEmail("signup");
    const { token } = await invite(people.owner, ventureId, email, "viewer");

    const headers = new Headers({ "x-forwarded-for": freshIp(), origin: APP_URL });
    expect(
      await register(
        { name: "New Person", email, password: STRONG_PASSWORD },
        headers,
        `/invite/${token}`,
      ),
    ).toEqual({ ok: true, data: undefined });
    await settleEmail();

    const verification = mailbox.outbox
      .filter((m) => m.to === email && m.category === "auth.verify-email")
      .at(-1)!;
    expect(verification.text).toContain(`next=${encodeURIComponent(`/invite/${token}`)}`);

    const [user] = await admin<{ id: string }[]>`select id from users where email = ${email}`;
    const newcomer = { userId: user!.id, correlationId: "corr-newcomer-01" };
    // Unverified identities cannot accept (verification rules are not weakened).
    expect(await acceptInvitation(newcomer, token)).toMatchObject({
      ok: false,
      code: "WRONG_ACCOUNT",
    });

    const verified = await api("/verify-email", {
      query: { token: tokenFromEmail(mailbox, email, "auth.verify-email") },
    });
    expect(verified.status).toBe(200);
    expect(await acceptInvitation(newcomer, token)).toEqual({ ok: true, ventureId });
    expect((await membershipOf(admin, ventureId, newcomer.userId))!.role).toBe("viewer");
  });

  it("drops unsafe registration return paths instead of embedding them in the email", async () => {
    const email = uniqueEmail("unsafe");
    const headers = new Headers({ "x-forwarded-for": freshIp(), origin: APP_URL });
    await register(
      { name: "Unsafe", email, password: STRONG_PASSWORD },
      headers,
      "https://evil.example/",
    );
    await settleEmail();
    const verification = mailbox.outbox
      .filter((m) => m.to === email && m.category === "auth.verify-email")
      .at(-1)!;
    expect(verification.text).not.toContain("evil.example");
    expect(verification.text).not.toContain("next=");
  });
});
