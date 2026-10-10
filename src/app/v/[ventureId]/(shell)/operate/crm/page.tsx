import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  can,
  resolveSelectedVenture,
  VentureNotFoundError,
  VentureStateError,
  type VentureAccess,
} from "@/modules/ventures";
import { requireActor } from "../../../../../actor";
import { NoVentureAccess } from "../../../no-access";
import { CrmScreen } from "./screen";

export const metadata: Metadata = { title: "Client CRM" };
export const dynamic = "force-dynamic";

export default async function CrmPage({ params }: { params: Promise<{ ventureId: string }> }) {
  const { ventureId } = await params;
  const actor = await requireActor(`/v/${ventureId}/operate/crm`);
  let access: VentureAccess;
  try {
    access = await resolveSelectedVenture(actor, ventureId);
  } catch (error) {
    if (error instanceof VentureNotFoundError) return <NoVentureAccess ventureId={ventureId} />;
    if (error instanceof VentureStateError) redirect("/");
    throw error;
  }
  if (!can(access.role, "crm:view")) return <NoVentureAccess ventureId={ventureId} />;
  return <CrmScreen />;
}
