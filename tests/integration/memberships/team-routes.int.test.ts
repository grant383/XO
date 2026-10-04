import type { Sql } from "postgres";
import { isValidElement, type ReactElement } from "react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closePools } from "@/platform/db";
import { MemoryTransport, setEmailTransportForTests } from "@/platform/email";
import { adminSql } from "../../helpers/db";
import { activeVenture, actor, membershipOf } from "../../helpers/memberships";

/**
 * The team, invitation and request-access route/action layer against the real modules and
 * database. Only the request boundary is replaced: the session and request headers.
 */
const session = vi.hoisted(() => ({
  current: null as { userId: string; email: string; name: string } | null,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ getAll: () => [] }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/modules/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/identity")>()),
  getSession: async () => (session.current ? { ...session.current, emailVerified: true } : null),
  logout: async () => ({ ok: true, data: undefined }),
  login: async () => ({ ok: true, data: { mfaRequired: false } }),
  hasSessionCookie: async () => false,
}));

const { default: TeamPage } = await import("@/app/v/[ventureId]/(shell)/settings/team/page");
const { NoVentureAccess } = await import("@/app/v/[ventureId]/no-access");
const teamActions = await import("@/app/v/[ventureId]/(shell)/settings/team/actions");
const { default: RequestAccessPage } = await import("@/app/v/[ventureId]/request-access/page");
const { requestAccessAction } = await import("@/app/v/[ventureId]/request-access/actions");
const { default: InvitationPage } = await import("@/app/invite/[token]/page");
const { acceptInvitationAction, switchAccountAction } =
  await import("@/app/invite/[token]/actions");
const { loginAction } = await import("@/app/auth/actions");

let admin: Sql;
let mailbox: MemoryTransport;
const idle = { status: "idle" } as const;

beforeAll(() => {
  admin = adminSql();
  mailbox = new MemoryTransport();
  setEmailTransportForTests(mailbox);
});
beforeEach(() => {
  session.current = null;
});
afterAll(async () => {
  setEmailTransportForTests(undefined);
  await closePools();
  await admin.end();
});

const signInAs = (p: { userId: string; email: string }) => {
  session.current = { userId: p.userId, email: p.email, name: "Test" };
};

/** Next.js signals redirect/notFound by throwing an error carrying a digest. */
async function digestOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const digest = (error as { digest?: unknown }).digest;
    if (typeof digest === "string") return digest;
    throw error;
  }
  throw new Error("expected a redirect or notFound");
}
const redirectTo = (digest: string) =>
  digest.startsWith("NEXT_REDIRECT;") ? digest.split(";")[2] : undefined;
const NOT_FOUND = "NEXT_HTTP_ERROR_FALLBACK;404";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
};
/**
 * Flattens a server-rendered element tree to text: strings, `href`s and `<ComponentName>`
 * markers (client components are not rendered on the server side of this boundary).
 */
function text(node: unknown): string {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (n === null || n === undefined || typeof n === "boolean") return;
    if (typeof n === "string" || typeof n === "number") return void out.push(String(n));
    if (Array.isArray(n)) return n.forEach(walk);
    if (isValidElement(n)) {
      const { type, props } = n as ReactElement<Record<string, unknown>>;
      if (typeof type === "function") out.push(`<${type.name}>`);
      if (typeof props.href === "string") out.push(props.href);
      // Headings and alerts carry their text in a `title` prop.
      if (typeof props.title === "string") out.push(props.title);
      walk(props.children);
    }
  };
  walk(node);
  return out.join(" ");
}

const venture = () =>
  activeVenture(admin, { owner: "owner", admin: "admin", manager: "manager", viewer: "viewer" });

describe("/v/[ventureId]/settings/team", () => {
  it("sends anonymous visitors to sign-in and back", async () => {
    const { ventureId } = await venture();
    const digest = await digestOf(() => TeamPage({ params: Promise.resolve({ ventureId }) }));
    expect(redirectTo(digest)).toBe(
      `/auth/login?next=${encodeURIComponent(`/v/${ventureId}/settings/team`)}`,
    );
  });

  it("renders for Admin+, refuses lower roles and offers non-members a request-access flow", async () => {
    const { ventureId, people } = await venture();
    const render = () => TeamPage({ params: Promise.resolve({ ventureId }) });

    signInAs(people.admin);
    const page = (await render()) as ReactElement;
    expect(text(page)).toContain("Invite a member");

    signInAs(people.viewer);
    const forbidden = text(await render());
    expect(forbidden).toContain("You don’t have access to team and permissions.");
    expect(forbidden).not.toContain("Invite a member");

    const outsider = await actor(admin, "outsider");
    signInAs(outsider);
    const denied = (await render()) as ReactElement;
    expect(isValidElement(denied) && denied.type).toBe(NoVentureAccess);

    // An unknown venture is indistinguishable from an inaccessible one.
    const unknown = (await TeamPage({
      params: Promise.resolve({ ventureId: "0f8fad5b-d9cb-469f-a165-70867728950e" }),
    })) as ReactElement;
    expect(unknown.type).toBe(NoVentureAccess);
    expect(await digestOf(() => TeamPage({ params: Promise.resolve({ ventureId: "nope" }) }))).toBe(
      NOT_FOUND,
    );
  });

  it("invites through the server action and reports authorisation failures", async () => {
    const { ventureId, people } = await venture();
    signInAs(people.admin);
    const ok = await teamActions.inviteMemberAction(
      ventureId,
      idle,
      form({ email: "Route-Invitee@Example.test", role: "viewer" }),
    );
    expect(ok).toEqual({
      status: "success",
      message: "Invitation sent to route-invitee@example.test.",
    });

    const dup = await teamActions.inviteMemberAction(
      ventureId,
      idle,
      form({ email: "route-invitee@example.test", role: "viewer" }),
    );
    expect(dup).toMatchObject({ status: "error", fieldErrors: { email: "Already invited." } });

    signInAs(people.viewer);
    expect(
      await teamActions.inviteMemberAction(
        ventureId,
        idle,
        form({ email: "x@example.test", role: "viewer" }),
      ),
    ).toEqual({ status: "error", message: "You do not have permission to manage this team." });

    const outsider = await actor(admin, "route-outsider");
    signInAs(outsider);
    expect(
      await teamActions.inviteMemberAction(
        ventureId,
        idle,
        form({ email: "y@example.test", role: "viewer" }),
      ),
    ).toEqual({ status: "error", message: "You no longer have access to this venture." });
  });

  it("changes roles and removes members through actions; removal blocks the next request", async () => {
    const { ventureId, people } = await venture();
    const viewerRow = await membershipOf(admin, ventureId, people.viewer.userId);
    const adminRow = await membershipOf(admin, ventureId, people.admin.userId);

    signInAs(people.admin);
    expect(
      await teamActions.changeRoleAction(
        ventureId,
        idle,
        form({ membershipId: adminRow!.id, role: "viewer", version: String(adminRow!.version) }),
      ),
    ).toMatchObject({
      status: "error",
      message: "You do not have permission to change this member.",
    });
    expect(
      await teamActions.changeRoleAction(
        ventureId,
        idle,
        form({
          membershipId: viewerRow!.id,
          role: "operator",
          version: String(viewerRow!.version),
        }),
      ),
    ).toEqual({ status: "success", message: "Role updated." });

    signInAs(people.owner);
    expect(
      await teamActions.changeStatusAction(
        ventureId,
        idle,
        form({ membershipId: adminRow!.id, change: "remove" }),
      ),
    ).toEqual({ status: "success", message: "Member removed. Their access ended immediately." });

    signInAs(people.admin);
    const after = (await TeamPage({ params: Promise.resolve({ ventureId }) })) as ReactElement;
    expect(after.type).toBe(NoVentureAccess);
    expect(
      await teamActions.inviteMemberAction(
        ventureId,
        idle,
        form({ email: "z@example.test", role: "viewer" }),
      ),
    ).toEqual({ status: "error", message: "You no longer have access to this venture." });
  });
});

describe("/v/[ventureId]/request-access", () => {
  it("returns the same outcome for real and unknown ventures and redirects members home", async () => {
    const { ventureId, people } = await venture();
    const requester = await actor(admin, "route-requester");
    signInAs(requester);
    expect(await requestAccessAction(ventureId)).toEqual({ status: "sent" });
    expect(await requestAccessAction("0f8fad5b-d9cb-469f-a165-70867728950e")).toEqual({
      status: "sent",
    });
    expect(text(await RequestAccessPage({ params: Promise.resolve({ ventureId }) }))).toContain(
      "<RequestAccessForm>",
    );

    signInAs(people.viewer);
    expect(
      redirectTo(
        await digestOf(() => RequestAccessPage({ params: Promise.resolve({ ventureId }) })),
      ),
    ).toBe("/");

    signInAs(people.owner);
    expect(
      await teamActions.approveRequestAction(
        ventureId,
        idle,
        form({
          requestId: (
            await admin<{ id: string }[]>`select id from venture_access_requests
                                          where requester_user_id = ${requester.userId}`
          )[0]!.id,
          role: "viewer",
        }),
      ),
    ).toEqual({ status: "success", message: "Access request approved." });
  });
});

describe("/invite/[token]", () => {
  async function invitationFor(email: string) {
    const { ventureId, people } = await venture();
    signInAs(people.owner);
    const res = await teamActions.inviteMemberAction(
      ventureId,
      idle,
      form({ email, role: "operator" }),
    );
    expect(res.status).toBe("success");
    const message = mailbox.outbox.filter((m) => m.to === email).at(-1)!;
    const token = /\/invite\/([A-Za-z0-9_-]{43})/.exec(message.text)![1]!;
    session.current = null;
    return { ventureId, token };
  }

  it("discloses nothing to anonymous visitors and links to sign-in/registration with the invite", async () => {
    const invitee = await actor(admin, "anon-invitee");
    const { token } = await invitationFor(invitee.email);
    const page = text(await InvitationPage({ params: Promise.resolve({ token }) }));
    expect(page).not.toContain("Team Co");
    expect(page).toContain(`/auth/login?next=${encodeURIComponent(`/invite/${token}`)}`);
    expect(page).toContain(`/auth/register?next=${encodeURIComponent(`/invite/${token}`)}`);
  });

  it("accepts on POST for the invited account; replays and other accounts fail", async () => {
    const invitee = await actor(admin, "route-invitee");
    const { ventureId, token } = await invitationFor(invitee.email);

    const intruder = await actor(admin, "route-intruder");
    signInAs(intruder);
    expect(text(await InvitationPage({ params: Promise.resolve({ token }) }))).toContain(
      "This invitation is for a different account",
    );
    expect(await acceptInvitationAction(token)).toMatchObject({ status: "error" });
    expect(redirectTo(await digestOf(() => switchAccountAction(token)))).toBe(
      `/auth/login?next=${encodeURIComponent(`/invite/${token}`)}`,
    );

    signInAs(invitee);
    expect(text(await InvitationPage({ params: Promise.resolve({ token }) }))).toContain(
      "<AcceptInvitationForm>",
    );
    expect(redirectTo(await digestOf(() => acceptInvitationAction(token)))).toBe(`/v/${ventureId}`);
    expect((await membershipOf(admin, ventureId, invitee.userId))!.role).toBe("operator");
    expect(await acceptInvitationAction(token)).toEqual({
      status: "error",
      message: "This invitation is invalid, has been revoked or has already been used.",
    });
  });

  it("rejects malformed tokens without a lookup", async () => {
    expect(text(await InvitationPage({ params: Promise.resolve({ token: "short" }) }))).toContain(
      "Invitation not valid",
    );
  });
});

describe("sign-in return path", () => {
  it("returns to a validated path and ignores external or malformed destinations", async () => {
    const token = "A".repeat(43);
    const login = (next: string) =>
      digestOf(() =>
        loginAction(idle, form({ email: "a@example.test", password: "x", next })),
      ).then(redirectTo);
    expect(await login(`/invite/${token}`)).toBe(`/invite/${token}`);
    for (const hostile of ["https://evil.example/", "//evil.example", "/\\evil", "/a/../b"]) {
      expect(await login(hostile)).toBe("/");
    }
  });
});
