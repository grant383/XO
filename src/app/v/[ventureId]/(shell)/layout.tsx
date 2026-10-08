import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  can,
  listSwitchableVentures,
  resolveSelectedVenture,
  ROLE_LABELS,
  VentureNotFoundError,
  VentureStateError,
  type VentureAccess,
} from "@/modules/ventures";
import { AppShell } from "../../../_shell/app-shell";
import type { ShellNavSection } from "../../../_shell/types";
import { requireActor } from "../../../actor";
import { NoVentureAccess } from "../no-access";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = { children: ReactNode; params: Promise<{ ventureId: string }> };

/**
 * Navigation shows only destinations that exist and that the role can open; the Figma
 * 8:651 sections (Portfolio, Build, Operate) gain items as their routes ship. Hiding an
 * item is presentation only: every page authorises on its own.
 */
function navigationFor(access: VentureAccess): ShellNavSection[] {
  const base = `/v/${access.id}`;
  const sections: ShellNavSection[] = [];
  if (can(access.role, "command:view")) {
    sections.push({
      label: "Operate",
      items: [
        { href: `${base}/command`, label: "Command", exact: true },
        { href: `${base}/command/growth-1m`, label: "£1M Growth Command", exact: true },
        { href: `${base}/operate/finance`, label: "Finance", exact: true },
      ],
    });
  }
  if (can(access.role, "operations:view")) {
    sections[0]?.items.push({
      href: `${base}/operate/operations`,
      label: "Operations",
      exact: true,
    });
  }
  if (can(access.role, "growth:view")) {
    sections[0]?.items.push({ href: `${base}/operate/growth`, label: "Growth", exact: true });
  }
  // Profile & Security is account-level (/settings/*), open to every signed-in user.
  const system = [{ href: "/settings/profile-security", label: "Profile & Security" }];
  if (can(access.role, "team:view")) {
    system.push({ href: `${base}/settings/team`, label: "Team & permissions" });
  }
  sections.push({ label: "System", items: system });
  return sections;
}

/**
 * Venture shell. The route id is only a reference: `resolveSelectedVenture` re-reads the
 * membership and role under RLS on every request (active ventures only). Unknown and
 * inaccessible ventures look identical (no enumeration); drafts belong to onboarding.
 */
export default async function VentureShellLayout({ children, params }: Props) {
  const { ventureId } = await params;
  if (!UUID.test(ventureId)) notFound();
  const actor = await requireActor(`/v/${ventureId}`);

  let access: VentureAccess;
  try {
    access = await resolveSelectedVenture(actor, ventureId);
  } catch (error) {
    if (error instanceof VentureNotFoundError) return <NoVentureAccess ventureId={ventureId} />;
    if (error instanceof VentureStateError) {
      redirect((error.status === "draft" ? `/onboarding/${ventureId}` : "/") as Route);
    }
    throw error;
  }

  const ventures = await listSwitchableVentures(actor);
  return (
    <AppShell
      venture={{
        id: access.id,
        name: access.name,
        roleLabel: ROLE_LABELS[access.role],
      }}
      ventures={ventures.map((v) => ({ id: v.id, name: v.name, roleLabel: ROLE_LABELS[v.role] }))}
      user={{ name: actor.name, email: actor.email }}
      nav={navigationFor(access)}
    >
      {children}
    </AppShell>
  );
}
