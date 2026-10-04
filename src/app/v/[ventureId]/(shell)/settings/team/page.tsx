import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTeam, type TeamView } from "@/modules/memberships";
import {
  can,
  ROLE_LABELS,
  VentureNotFoundError,
  VenturePermissionError,
  VentureStateError,
} from "@/modules/ventures";
import { Avatar, ButtonLink, EmptyState, Icon, StatusBadge } from "@/ui";
import { PageContent, PageHeader } from "../../../../../_shell/page-header";
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
import { InviteForm, ManageMenu, RoleSelect, RowActionForm } from "./forms";
import styles from "./team.module.css";

export const metadata: Metadata = { title: "Team and permissions" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ ventureId: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });

type LoadResult =
  | { kind: "ok"; team: TeamView }
  | { kind: "no-access" }
  | { kind: "forbidden"; ventureName?: string };

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

/** A short visible verb with the target kept for assistive technology ("Revoke …"). */
function act(verb: string, target: string) {
  return (
    <>
      {verb}
      <span className="visually-hidden"> {target}</span>
    </>
  );
}

function SectionHeading({ id, title, children }: { id: string; title: string; children?: string }) {
  return (
    <div className={styles.sectionHeading}>
      <h2 id={id}>{title}</h2>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

/** Team and Permissions (spec §8, Figma 33:3712) inside the application shell. */
export default async function TeamPage({ params }: Props) {
  const { ventureId } = await params;
  if (!UUID.test(ventureId)) notFound();
  const result = await load(ventureId);
  if (result.kind === "no-access") return <NoVentureAccess ventureId={ventureId} />;
  if (result.kind === "forbidden") {
    return (
      <>
        <PageHeader
          crumbs={[{ label: "System" }, { label: "Team & permissions" }]}
          title="Team & permissions"
        />
        <PageContent>
          <EmptyState
            icon="key-round"
            title="You do not have permission to manage this team"
            description="Team and permissions are available to the venture Owner and Admins."
            action={
              <ButtonLink href={`/v/${ventureId}`} variant="secondary">
                Go to venture home
              </ButtonLink>
            }
          />
        </PageContent>
      </>
    );
  }

  const { team } = result;
  const { viewer } = team;
  const roleOptions = viewer.assignableRoles.map((r) => ({ value: r, label: ROLE_LABELS[r] }));
  const canInvite = can(viewer.role, "team:invite");
  const canChangeRoles = can(viewer.role, "team:update_role");
  const canRemove = can(viewer.role, "team:remove");
  const active = team.members.filter((m) => m.status === "active");
  const suspended = team.members.length - active.length;
  const administrators = active.filter((m) => can(m.role, "team:view")).length;
  const pendingInvites = team.invitations.filter((i) => !i.expired).length;

  return (
    <>
      <PageHeader
        crumbs={[
          { label: team.venture.name, href: `/v/${ventureId}` },
          { label: "System" },
          { label: "Team & permissions" },
        ]}
        title="Team & permissions"
        actions={
          canInvite ? (
            <ButtonLink href="#invite">
              <Icon name="user-plus-button" />
              Invite member
            </ButtonLink>
          ) : undefined
        }
      >
        Manage who can access {team.venture.name} and what each person can do. You are{" "}
        {viewer.role === "owner" ? "the Owner" : `an ${ROLE_LABELS[viewer.role]}`}.
      </PageHeader>

      <PageContent>
        <dl className={styles.metrics}>
          <div className={styles.metric}>
            <dt>Active members</dt>
            <dd>{active.length}</dd>
          </div>
          <div className={styles.metric}>
            <dt>Administrators</dt>
            <dd>{administrators}</dd>
          </div>
          <div className={styles.metric}>
            <dt>Pending invites</dt>
            <dd>{pendingInvites}</dd>
          </div>
        </dl>

        <section className={styles.card} aria-labelledby="members-heading">
          <SectionHeading id="members-heading" title="Venture members">
            {`${active.length} active${suspended ? ` · ${suspended} suspended` : ""}. Owners and Admins manage access; nobody changes their own role.`}
          </SectionHeading>
          <div
            className={styles.tableRegion}
            role="region"
            aria-labelledby="members-heading"
            tabIndex={0}
          >
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Member</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Joined</th>
                  <th scope="col" className={styles.actionCol}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {team.members.map((m) => (
                  <tr key={m.membershipId}>
                    <td>
                      <div className={styles.member}>
                        <Avatar name={m.name} size={32} />
                        <div className={styles.memberCopy}>
                          <span className={styles.memberName}>
                            {m.name}
                            {m.isSelf ? " (you)" : ""}
                          </span>
                          <span className={styles.memberEmail}>{m.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className={styles.role}>{ROLE_LABELS[m.role]}</td>
                    <td>
                      {m.status === "active" ? (
                        <StatusBadge tone="success">Active</StatusBadge>
                      ) : (
                        <StatusBadge tone="warning">Suspended</StatusBadge>
                      )}
                    </td>
                    <td className={styles.muted}>{dateFormat.format(m.joinedAt)}</td>
                    <td className={styles.actionCol}>
                      {m.manageable && (canChangeRoles || canRemove) ? (
                        <ManageMenu label={m.name}>
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
                                label={act(
                                  m.status === "active" ? "Suspend" : "Reactivate",
                                  m.name,
                                )}
                                pendingLabel="Saving…"
                              />
                              <RowActionForm
                                action={changeStatusAction.bind(null, ventureId)}
                                hidden={{
                                  membershipId: m.membershipId,
                                  version: String(m.version),
                                  change: "remove",
                                }}
                                label={act("Remove", m.name)}
                                pendingLabel="Removing…"
                                variant="danger"
                              />
                            </>
                          ) : null}
                        </ManageMenu>
                      ) : (
                        <span className={styles.muted}>
                          {m.role === "owner" ? "Venture Owner" : m.isSelf ? "You" : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {canInvite ? (
          <section id="invite" className={styles.card} aria-labelledby="invite-heading">
            <SectionHeading id="invite-heading" title="Invite a member">
              The invitation link is single-use and works only for the address you enter.
            </SectionHeading>
            <div className={styles.cardBody}>
              <InviteForm action={inviteMemberAction.bind(null, ventureId)} roles={roleOptions} />
            </div>
          </section>
        ) : null}

        <section className={styles.card} aria-labelledby="invitations-heading">
          <SectionHeading id="invitations-heading" title="Pending invitations">
            Invitations expire seven days after they are sent.
          </SectionHeading>
          <div className={styles.cardBody}>
            {team.invitations.length === 0 ? (
              <p className={styles.empty}>No pending invitations.</p>
            ) : (
              <ul className={styles.rows}>
                {team.invitations.map((i) => (
                  <li key={i.id} className={styles.row}>
                    <span className={styles.pendingMarker} aria-hidden="true" />
                    <div className={styles.memberCopy}>
                      <span className={styles.memberName}>
                        {i.email} · {ROLE_LABELS[i.role]}
                      </span>
                      <span className={styles.memberEmail}>
                        {i.expired ? "Expired" : `Expires ${dateFormat.format(i.expiresAt)}`}
                        {i.invitedByName ? ` · Invited by ${i.invitedByName}` : ""}
                      </span>
                    </div>
                    {canInvite && i.manageable ? (
                      <RowActionForm
                        action={revokeInvitationAction.bind(null, ventureId)}
                        hidden={{ invitationId: i.id }}
                        label={act("Revoke", `invitation for ${i.email}`)}
                        pendingLabel="Revoking…"
                        variant="danger"
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className={styles.card} aria-labelledby="requests-heading">
          <SectionHeading id="requests-heading" title="Access requests">
            People who asked to join from a shared link. You choose their role when you approve.
          </SectionHeading>
          <div className={styles.cardBody}>
            {team.accessRequests.length === 0 ? (
              <p className={styles.empty}>No pending access requests.</p>
            ) : (
              <ul className={styles.rows}>
                {team.accessRequests.map((r) => (
                  <li key={r.id} className={styles.row}>
                    <span className={styles.pendingMarker} aria-hidden="true" />
                    <div className={styles.memberCopy}>
                      <span className={styles.memberName}>{r.requesterName}</span>
                      <span className={styles.memberEmail}>
                        {r.requesterEmail} · Requested {dateFormat.format(r.requestedAt)}
                      </span>
                    </div>
                    {canInvite ? (
                      <div className={styles.rowActions}>
                        <RowActionForm
                          action={approveRequestAction.bind(null, ventureId)}
                          hidden={{ requestId: r.id }}
                          label={act("Approve", r.requesterName)}
                          pendingLabel="Approving…"
                          variant="primary"
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
                          label={act("Reject", r.requesterName)}
                          pendingLabel="Rejecting…"
                          variant="danger"
                        />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </PageContent>
    </>
  );
}
