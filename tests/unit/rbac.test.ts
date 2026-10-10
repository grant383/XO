import { describe, expect, it } from "vitest";
import {
  assignableRoles,
  can,
  canChangeMember,
  canManageRole,
  capabilitiesOf,
  CAPABILITIES,
  isVentureRole,
  rolesWith,
  VENTURE_ROLES,
  type VentureRole,
} from "@/modules/ventures/rbac";
import { safeNextPath, withNext } from "@/modules/identity/redirects";
import {
  generateInvitationToken,
  hashInvitationToken,
  invitationPath,
  isWellFormedInvitationToken,
} from "@/modules/memberships/tokens";
import { invitationEmail } from "@/modules/memberships/emails";
import { invitationInput } from "@/modules/memberships/policy";

describe("role defaults (spec §7)", () => {
  it("resolves the P0 capability matrix from the role alone", () => {
    expect(capabilitiesOf("owner")).toEqual([...CAPABILITIES]);
    expect(capabilitiesOf("admin")).toEqual(CAPABILITIES.filter((c) => c !== "venture:onboard"));
    for (const role of ["manager", "operator"] as const) {
      expect(capabilitiesOf(role)).toEqual([
        "venture:view",
        "command:view",
        "command:manage_tasks",
        "operations:view",
        "growth:view",
        "technology:view",
        "crm:view",
      ]);
    }
    expect(capabilitiesOf("viewer")).toEqual(["venture:view", "command:view"]);
  });

  it("opens Command Centre to Viewer+ and task changes to Operator+ (spec §7, §8)", () => {
    expect(rolesWith("command:view")).toEqual(VENTURE_ROLES);
    expect(rolesWith("command:manage_tasks")).toEqual(["owner", "admin", "manager", "operator"]);
  });

  it("gives Team and Permissions to Admin+ only (spec §8)", () => {
    expect(rolesWith("team:view")).toEqual(["owner", "admin"]);
    for (const c of ["team:invite", "team:update_role", "team:remove"] as const) {
      expect(VENTURE_ROLES.filter((r) => can(r, c))).toEqual(["owner", "admin"]);
    }
  });

  it("keeps onboarding Owner-only and denies everything without a role", () => {
    expect(rolesWith("venture:onboard")).toEqual(["owner"]);
    for (const c of CAPABILITIES) {
      expect(can(null, c)).toBe(false);
      expect(can(undefined, c)).toBe(false);
    }
  });

  it("recognises only the five spec roles", () => {
    expect(VENTURE_ROLES).toEqual(["owner", "admin", "manager", "operator", "viewer"]);
    expect(isVentureRole("admin")).toBe(true);
    expect(isVentureRole("member")).toBe(false);
    expect(isVentureRole("OWNER")).toBe(false);
  });
});

describe("role management rules", () => {
  it("lets the Owner assign every role except Owner", () => {
    expect(assignableRoles("owner")).toEqual(["admin", "manager", "operator", "viewer"]);
  });

  it("lets Admins assign Manager, Operator and Viewer only", () => {
    expect(assignableRoles("admin")).toEqual(["manager", "operator", "viewer"]);
    expect(canManageRole("admin", "admin")).toBe(false);
  });

  it("gives Managers, Operators and Viewers no team authority", () => {
    for (const role of ["manager", "operator", "viewer"] as const) {
      expect(assignableRoles(role)).toEqual([]);
    }
  });

  it("never allows assigning or managing the Owner", () => {
    for (const actor of VENTURE_ROLES) {
      expect(canManageRole(actor, "owner")).toBe(false);
      expect(
        canChangeMember({
          actorRole: actor,
          targetRole: "viewer",
          isSelf: false,
          nextRole: "owner",
        }),
      ).toBe(false);
      expect(canChangeMember({ actorRole: actor, targetRole: "owner", isSelf: false })).toBe(false);
    }
  });

  it("blocks self-escalation and self-changes for every role", () => {
    for (const actor of VENTURE_ROLES) {
      for (const next of VENTURE_ROLES) {
        expect(
          canChangeMember({ actorRole: actor, targetRole: actor, isSelf: true, nextRole: next }),
        ).toBe(false);
      }
    }
  });

  it("stops an Admin promoting someone to Admin or acting on another Admin", () => {
    expect(
      canChangeMember({
        actorRole: "admin",
        targetRole: "manager",
        isSelf: false,
        nextRole: "admin",
      }),
    ).toBe(false);
    expect(canChangeMember({ actorRole: "admin", targetRole: "admin", isSelf: false })).toBe(false);
    expect(
      canChangeMember({
        actorRole: "admin",
        targetRole: "viewer",
        isSelf: false,
        nextRole: "operator",
      }),
    ).toBe(true);
  });

  it("lets the Owner demote an Admin", () => {
    const input = { actorRole: "owner" as VentureRole, targetRole: "admin" as VentureRole };
    expect(canChangeMember({ ...input, isSelf: false, nextRole: "viewer" })).toBe(true);
  });
});

describe("post-authentication redirects", () => {
  it("accepts same-origin application paths", () => {
    const token = "A".repeat(43);
    expect(safeNextPath(`/invite/${token}`)).toBe(`/invite/${token}`);
    expect(safeNextPath("/v/0f8fad5b-d9cb-469f-a165-70867728950e/request-access")).toBe(
      "/v/0f8fad5b-d9cb-469f-a165-70867728950e/request-access",
    );
  });

  it.each([
    "https://evil.example/",
    "//evil.example/",
    "/\\evil.example",
    "/../etc",
    "/a//b",
    "/x?y=1",
    "/x#frag",
    "/%2F%2Fevil.example",
    "javascript:alert(1)",
    "",
    "relative/path",
    `/${"a".repeat(600)}`,
  ])("rejects %s", (value) => {
    expect(safeNextPath(value)).toBeNull();
  });

  it("rejects non-strings and builds encoded auth links", () => {
    expect(safeNextPath(["/a"])).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
    expect(withNext("/auth/login", "/invite/abc")).toBe("/auth/login?next=%2Finvite%2Fabc");
    expect(withNext("/auth/register", "https://evil.example")).toBe("/auth/register");
  });
});

describe("invitation tokens", () => {
  it("are 256-bit base64url values stored only as a SHA-256 digest", () => {
    const { token, tokenHash } = generateInvitationToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).not.toBe(token);
    expect(hashInvitationToken(token)).toBe(tokenHash);
    expect(generateInvitationToken().token).not.toBe(token);
  });

  it("rejects malformed tokens before any lookup", () => {
    expect(isWellFormedInvitationToken("A".repeat(43))).toBe(true);
    for (const bad of ["", "short", "A".repeat(44), `${"A".repeat(42)}=`, 42, null]) {
      expect(isWellFormedInvitationToken(bad)).toBe(false);
    }
    expect(invitationPath("abc")).toBe("/invite/abc");
  });
});

describe("invitation input and email", () => {
  it("normalises the address and refuses Owner or unknown roles", () => {
    expect(invitationInput.parse({ email: "  New@Example.COM ", role: "operator" })).toEqual({
      email: "new@example.com",
      role: "operator",
    });
    expect(invitationInput.safeParse({ email: "x@example.com", role: "owner" }).success).toBe(
      false,
    );
    expect(invitationInput.safeParse({ email: "x@example.com", role: "member" }).success).toBe(
      false,
    );
    expect(invitationInput.safeParse({ email: "not-an-email", role: "viewer" }).success).toBe(
      false,
    );
  });

  it("escapes names in HTML and states expiry and single use", () => {
    const message = invitationEmail({
      to: "new@example.com",
      inviterName: "<script>x</script>",
      ventureName: "Acme & Co",
      roleLabel: "Viewer",
      url: "https://app.test/invite/abc",
      ttlDays: 7,
    });
    expect(message.category).toBe("team.invitation");
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("Acme &#38; Co");
    expect(message.text).toContain("expires in 7 days and can be used once");
    expect(message.text).toContain("https://app.test/invite/abc");
  });
});
