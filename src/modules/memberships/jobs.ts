import { and, eq } from "drizzle-orm";
import { schema, withService } from "@/platform/db";
import { can, type Capability, type VentureRole } from "@/modules/ventures";

const { ventureMemberships } = schema;

/** The user a job acts for is no longer an active member with the required capability. */
export class MembershipRevokedError extends Error {
  constructor() {
    super("Membership no longer grants this action");
    this.name = "MembershipRevokedError";
  }
}

/**
 * Background jobs run with an explicit service identity and venture (spec §15). A job that
 * acts on behalf of a user (e.g. a user-initiated export) must call this when it executes,
 * not when it is enqueued, so that removal, suspension or a role change made in between
 * is honoured. Reads membership through the service's venture-scoped RLS context.
 */
export async function assertMembershipForJob(input: {
  serviceId: string;
  ventureId: string;
  userId: string;
  capability: Capability;
  correlationId?: string;
}): Promise<VentureRole> {
  const [row] = await withService(
    { serviceId: input.serviceId, ventureId: input.ventureId, correlationId: input.correlationId },
    (tx) =>
      tx
        .select({ role: ventureMemberships.role })
        .from(ventureMemberships)
        .where(
          and(
            eq(ventureMemberships.ventureId, input.ventureId),
            eq(ventureMemberships.userId, input.userId),
            eq(ventureMemberships.status, "active"),
          ),
        ),
  );
  if (!row || !can(row.role, input.capability)) throw new MembershipRevokedError();
  return row.role;
}
