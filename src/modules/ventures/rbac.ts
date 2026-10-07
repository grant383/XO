/**
 * Canonical venture RBAC (spec §7, §15; ADR-0013). Every server-side permission decision
 * goes through `can()` / `rolesWith()` / `canManageRole()`: no other code compares role
 * strings. PostgreSQL RLS independently enforces tenancy and the team-management rules
 * (migrations 0001, 0007), so a bug here cannot grant cross-venture access.
 *
 * Permissions are derived from the role only (no per-user overrides in P0) and are read
 * from the database on every request, so a role change applies to the next request.
 */
export type VentureRole = "owner" | "admin" | "manager" | "operator" | "viewer";

/** Most to least privileged. */
export const VENTURE_ROLES = ["owner", "admin", "manager", "operator", "viewer"] as const;

export const ROLE_LABELS: Record<VentureRole, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  operator: "Operator",
  viewer: "Viewer",
};

/**
 * P0 capabilities. Later phases add domain capabilities (command, finance, crm, ...)
 * to this table rather than introducing new checks elsewhere.
 */
export const CAPABILITIES = [
  "venture:view",
  "venture:update",
  /** Venture setup before activation (spec §8: onboarding routes are Owner-only). */
  "venture:onboard",
  "team:view",
  /** Invite members and approve/reject access requests (both grant membership). */
  "team:invite",
  "team:update_role",
  /** Suspend, reactivate and remove members. */
  "team:remove",
  "settings:view",
  "settings:update",
  "audit:view",
  /** Command Centre (spec §8: Viewer+). */
  "command:view",
  /** Create, complete and reopen Command Centre tasks (day-to-day records: Operator+). */
  "command:manage_tasks",
  /** Operate Operations reference screen (spec §8: Operator+). */
  "operations:view",
  /** Operate Growth reference screen (spec §8: Operator+). */
  "growth:view",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const VIEWER_PLUS: readonly VentureRole[] = ["owner", "admin", "manager", "operator", "viewer"];
const OPERATOR_PLUS: readonly VentureRole[] = ["owner", "admin", "manager", "operator"];
const ADMIN_PLUS: readonly VentureRole[] = ["owner", "admin"];
const OWNER: readonly VentureRole[] = ["owner"];

/** Minimum roles per capability (spec §7 matrix notation: Viewer+, Operator+, Admin+, Owner). */
const GRANTS: Record<Capability, readonly VentureRole[]> = {
  "venture:view": VIEWER_PLUS,
  "venture:update": ADMIN_PLUS,
  "venture:onboard": OWNER,
  // Spec §8: Team and Permissions is Admin+.
  "team:view": ADMIN_PLUS,
  "team:invite": ADMIN_PLUS,
  "team:update_role": ADMIN_PLUS,
  "team:remove": ADMIN_PLUS,
  "settings:view": ADMIN_PLUS,
  "settings:update": ADMIN_PLUS,
  // Matches the audit_log SELECT policy (Owner/Admin).
  "audit:view": ADMIN_PLUS,
  "command:view": VIEWER_PLUS,
  // Matches the command_tasks INSERT/UPDATE policies (migration 0014).
  "command:manage_tasks": OPERATOR_PLUS,
  "operations:view": OPERATOR_PLUS,
  "growth:view": OPERATOR_PLUS,
};

export function can(role: VentureRole | null | undefined, capability: Capability): boolean {
  return role != null && GRANTS[capability].includes(role);
}

/** Roles holding a capability (for resolving a venture with a minimum permission). */
export function rolesWith(capability: Capability): readonly VentureRole[] {
  return GRANTS[capability];
}

export function capabilitiesOf(role: VentureRole): Capability[] {
  return CAPABILITIES.filter((c) => can(role, c));
}

/**
 * Whether `actor` may assign `role` to someone, or act on a member/invitation holding it.
 * Owner manages every non-owner role; Admin manages Manager/Operator/Viewer. Nobody
 * assigns Owner (ownership transfer is not part of P0). Mirrors `app.can_manage_role`.
 */
export function canManageRole(actor: VentureRole, role: VentureRole): boolean {
  if (role === "owner") return false;
  if (actor === "owner") return true;
  return actor === "admin" && role !== "admin";
}

export function assignableRoles(actor: VentureRole): VentureRole[] {
  return VENTURE_ROLES.filter((r) => canManageRole(actor, r));
}

/**
 * Whether `actor` may change another member currently holding `targetRole` to `nextRole`
 * (or suspend/remove them when `nextRole` is omitted). Acting on one's own membership is
 * never allowed: it is how self-escalation and self-lockout would happen.
 */
export function canChangeMember(input: {
  actorRole: VentureRole;
  targetRole: VentureRole;
  isSelf: boolean;
  nextRole?: VentureRole;
}): boolean {
  if (input.isSelf) return false;
  if (!canManageRole(input.actorRole, input.targetRole)) return false;
  return input.nextRole === undefined || canManageRole(input.actorRole, input.nextRole);
}

export function isVentureRole(value: unknown): value is VentureRole {
  return typeof value === "string" && (VENTURE_ROLES as readonly string[]).includes(value);
}
