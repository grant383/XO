import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTeam, type TeamView } from "@/modules/memberships";
import {
  can,
  ROLE_LABELS,
  VentureNotFoundError,
  VenturePermissionError,
  VentureStateError,
} from "@/modules/ventures";
import { requireActor } from "../../../../../actor";
import { NoVentureAccess } from "../../../no-access";
import {
  approveRequestAction,
  changeRoleAction,
  changeStatusAction,
  inviteMemberAction,
  rejectRequestAction,
  revokeInvitationAction,
} from "./actions";
import { InviteForm, RoleSelect, RowActionForm } from "./forms";

export const metadata: Metadata = { title: "Team and permissions" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ ventureId: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });

type LoadResult = { kind: "ok"; team: TeamView } | { kind: "no-access" } | { kind: "forbidden" };

/**
 * The route id is only a reference: the memberships module resolves membership, role and
 * capability (`team:view`, Admin+) under RLS on every request.
 */
async function load(ventureId: string): Promise<LoadResult> {
  const actor = await requireActor(`/v/${ventureId}/settings/team`);
  try {
    return { kind: "ok", team: await getTeam(actor, ventureId) };
  } catch (error) {
    // Unknown and inaccessible ventures look the same (no enumeration).
    if (error instanceof VentureNotFoundError) return { kind: "no-access" };
    if (error instanceof VenturePermissionError) return { kind: "forbidden" };
    if (error instanceof VentureStateError) redirect("/");
    throw error;
  }
}

/** Team and Permissions (spec §8, Figma 33:3712; minimal functional P0 presentation). */
export default async function TeamPage({ params }: Props) {
  const { ventureId } = await params;
  if (!UUID.test(ventureId)) notFound();
  const result = await load(ventureId);
  if (result.kind === "no-access") return <NoVentureAccess ventureId={ventureId} />;
  if (result.kind === "forbidden") {
    return (
      <main style={{ maxWidth: 640, margin: "48px auto", padding: "0 16px" }}>
        <h1>You do not have permission to manage this team</h1>
        <p>Team and permissions are available to the venture Owner and Admins.</p>
        <Link href="/">Go to home</Link>
      </main>
    );
  }

  const { team } = result;
  const { viewer } = team;
  const roleOptions = viewer.assignableRoles.map((r) => ({ value: r, label: ROLE_LABELS[r] }));
  const canInvite = can(viewer.role, "team:invite");
  const canChangeRoles = can(viewer.role, "team:update_role");
  const canRemove = can(viewer.role, "team:remove");

  return (
    <main style={{ maxWidth: 960, margin: "48px auto", padding: "0 16px" }}>
      <p>
        <Link href="/">Home</Link>
      </p>
      <h1>Team and permissions</h1>
      <p>
        {team.venture.name} · You are {ROLE_LABELS[viewer.role]}
      </p>

      <section aria-labelledby="members-heading">
        <h2 id="members-heading">Members ({team.members.length})</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {team.members.map((m) => (
              <tr key={m.membershipId}>
                <td>
                  {m.name}
                  {m.isSelf ? " (you)" : ""}
                </td>
                <td>{m.email}</td>
                <td>{ROLE_LABELS[m.role]}</td>
                <td>{m.status === "active" ? "Active" : "Suspended"}</td>
                <td>
                  {m.manageable ? (
                    <>
                      {canChangeRoles ? (
                        <RowActionForm
                          action={changeRoleAction.bind(null, ventureId)}
                          hidden={{ membershipId: m.membershipId, version: String(m.version) }}
                          label="Change role"
                          pendingLabel="Saving…"
                        >
                          <RoleSelect
                            id={`role-${m.membershipId}`}
                            label={`Role for ${m.name}`}
                            roles={roleOptions}
                            defaultValue={m.role}
                          />
                        </RowActionForm>
                      ) : null}
                      {canRemove ? (
                        <>
                          <RowActionForm
                            action={changeStatusAction.bind(null, ventureId)}
                            hidden={{
                              membershipId: m.membershipId,
                              version: String(m.version),
                              change: m.status === "active" ? "suspend" : "reactivate",
                            }}
                            label={
                              m.status === "active" ? `Suspend ${m.name}` : `Reactivate ${m.name}`
                            }
                            pendingLabel="Saving…"
                          />
                          <RowActionForm
                            action={changeStatusAction.bind(null, ventureId)}
                            hidden={{
                              membershipId: m.membershipId,
                              version: String(m.version),
                              change: "remove",
                            }}
                            label={`Remove ${m.name}`}
                            pendingLabel="Removing…"
                          />
                        </>
                      ) : null}
                    </>
                  ) : (
                    <span>{m.role === "owner" ? "Venture Owner" : "—"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {canInvite ? (
        <section aria-labelledby="invite-heading">
          <h2 id="invite-heading">Invite a member</h2>
          <InviteForm action={inviteMemberAction.bind(null, ventureId)} roles={roleOptions} />
        </section>
      ) : null}

      <section aria-labelledby="invitations-heading">
        <h2 id="invitations-heading">Pending invitations</h2>
        {team.invitations.length === 0 ? (
          <p>No pending invitations.</p>
        ) : (
          <ul>
            {team.invitations.map((i) => (
              <li key={i.id}>
                {i.email} — {ROLE_LABELS[i.role]} —{" "}
                {i.expired ? "Expired" : `Expires ${dateFormat.format(i.expiresAt)}`}
                {i.invitedByName ? ` — invited by ${i.invitedByName}` : ""}{" "}
                {canInvite && i.manageable ? (
                  <RowActionForm
                    action={revokeInvitationAction.bind(null, ventureId)}
                    hidden={{ invitationId: i.id }}
                    label={`Revoke invitation for ${i.email}`}
                    pendingLabel="Revoking…"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="requests-heading">
        <h2 id="requests-heading">Access requests</h2>
        {team.accessRequests.length === 0 ? (
          <p>No pending access requests.</p>
        ) : (
          <ul>
            {team.accessRequests.map((r) => (
              <li key={r.id}>
                {r.requesterName} ({r.requesterEmail}) — requested{" "}
                {dateFormat.format(r.requestedAt)}{" "}
                {canInvite ? (
                  <>
                    <RowActionForm
                      action={approveRequestAction.bind(null, ventureId)}
                      hidden={{ requestId: r.id }}
                      label={`Approve ${r.requesterName}`}
                      pendingLabel="Approving…"
                    >
                      <RoleSelect
                        id={`request-role-${r.id}`}
                        label={`Role for ${r.requesterName}`}
                        roles={roleOptions}
                        defaultValue="viewer"
                      />
                    </RowActionForm>
                    <RowActionForm
                      action={rejectRequestAction.bind(null, ventureId)}
                      hidden={{ requestId: r.id }}
                      label={`Reject ${r.requesterName}`}
                      pendingLabel="Rejecting…"
                    />
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
