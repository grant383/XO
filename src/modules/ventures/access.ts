import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { schema, withTenant, withUser } from "@/platform/db";
import { VentureNotFoundError, VenturePermissionError, VentureStateError } from "./errors";

const { ventures, ventureMemberships } = schema;

export type VentureRole = "owner" | "admin" | "manager" | "operator" | "viewer";
export type VentureStatus = "draft" | "active" | "suspended" | "archived";

/** Who is acting. Resolved from the authenticated session by the app layer. */
export type Actor = { userId: string; correlationId?: string };

export type VentureSummary = {
  id: string;
  name: string;
  status: VentureStatus;
  role: VentureRole;
};

export type VentureAccess = VentureSummary & { userId: string; correlationId?: string };

const ventureId = z.uuid();

/**
 * All ventures the actor actively belongs to, including drafts. Visibility is enforced
 * by RLS (ventures: active membership; memberships: own rows).
 */
export async function listMyVentures(actor: Actor): Promise<VentureSummary[]> {
  const rows = await withUser({ userId: actor.userId }, (tx) =>
    tx
      .select({
        id: ventures.id,
        name: ventures.name,
        status: ventures.status,
        role: ventureMemberships.role,
      })
      .from(ventures)
      .innerJoin(
        ventureMemberships,
        and(
          eq(ventureMemberships.ventureId, ventures.id),
          eq(ventureMemberships.userId, actor.userId),
          eq(ventureMemberships.status, "active"),
        ),
      )
      .orderBy(asc(ventures.name), asc(ventures.id)),
  );
  return rows;
}

/** Ventures shown in product navigation / the venture switcher: active ones only. */
export async function listSwitchableVentures(actor: Actor): Promise<VentureSummary[]> {
  return (await listMyVentures(actor)).filter((v) => v.status === "active");
}

/** Draft ventures the actor owns and can resume onboarding for. */
export async function listDraftVentures(actor: Actor): Promise<VentureSummary[]> {
  return (await listMyVentures(actor)).filter((v) => v.status === "draft" && v.role === "owner");
}

type ResolveOptions = { roles?: readonly VentureRole[]; statuses?: readonly VentureStatus[] };

/**
 * Resolves a venture id from a route for the actor. Never trusts the id: membership and
 * role are read inside a tenant-scoped transaction, so RLS independently confirms access.
 *
 * @throws VentureNotFoundError unknown id, malformed id, or no active membership
 * @throws VenturePermissionError member without one of `roles`
 * @throws VentureStateError venture status not in `statuses`
 */
export async function resolveVenture(
  actor: Actor,
  id: string,
  options: ResolveOptions = {},
): Promise<VentureAccess> {
  const parsed = ventureId.safeParse(id);
  if (!parsed.success) throw new VentureNotFoundError();

  const [row] = await withTenant({ userId: actor.userId, ventureId: parsed.data }, (tx) =>
    tx
      .select({
        id: ventures.id,
        name: ventures.name,
        status: ventures.status,
        role: ventureMemberships.role,
      })
      .from(ventures)
      .innerJoin(
        ventureMemberships,
        and(
          eq(ventureMemberships.ventureId, ventures.id),
          eq(ventureMemberships.userId, actor.userId),
          eq(ventureMemberships.status, "active"),
        ),
      )
      .where(eq(ventures.id, parsed.data)),
  );
  if (!row) throw new VentureNotFoundError();
  if (options.roles && !options.roles.includes(row.role)) {
    throw new VenturePermissionError(options.roles);
  }
  if (options.statuses && !options.statuses.includes(row.status)) {
    throw new VentureStateError(row.status);
  }
  return { ...row, userId: actor.userId, correlationId: actor.correlationId };
}

/**
 * Venture switching foundation: resolves the venture selected in a product route
 * (`/v/[ventureId]`). Only active ventures are selectable; drafts belong to onboarding.
 */
export async function resolveSelectedVenture(actor: Actor, id: string): Promise<VentureAccess> {
  return resolveVenture(actor, id, { statuses: ["active"] });
}
