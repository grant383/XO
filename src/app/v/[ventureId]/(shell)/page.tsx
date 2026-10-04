import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  can,
  resolveSelectedVenture,
  ROLE_LABELS,
  VentureNotFoundError,
  VentureStateError,
} from "@/modules/ventures";
import { ButtonLink, EmptyState, Icon } from "@/ui";
import { PageContent, PageHeader } from "../../../_shell/page-header";
import { requireActor } from "../../../actor";
import { NoVentureAccess } from "../no-access";

export const metadata: Metadata = { title: "Home" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ ventureId: string }> };

/**
 * Venture home inside the shell. Command Centre (P1) will replace this; until then the
 * Generic Empty state (Figma 54:27962) says plainly that nothing else is available yet.
 */
export default async function VentureHomePage({ params }: Props) {
  const { ventureId } = await params;
  const actor = await requireActor(`/v/${ventureId}`);
  let access;
  try {
    access = await resolveSelectedVenture(actor, ventureId);
  } catch (error) {
    if (error instanceof VentureNotFoundError) return <NoVentureAccess ventureId={ventureId} />;
    if (error instanceof VentureStateError) redirect("/");
    throw error;
  }

  const canManageTeam = can(access.role, "team:view");
  return (
    <>
      <PageHeader crumbs={[{ label: access.name }, { label: "Home" }]} title={access.name}>
        Your role in this venture: {ROLE_LABELS[access.role]}.
      </PageHeader>
      <PageContent>
        <EmptyState
          title="Nothing here yet"
          description={
            canManageTeam
              ? "Command Centre and the operating modules are not available yet. Start by inviting your team and choosing their roles."
              : "Command Centre and the operating modules are not available yet. A venture Owner or Admin manages who has access."
          }
          action={
            canManageTeam ? (
              <ButtonLink href={`/v/${ventureId}/settings/team`}>
                Manage team
                <Icon name="arrow-right" />
              </ButtonLink>
            ) : undefined
          }
        />
      </PageContent>
    </>
  );
}
