import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { resolveVenture, VentureNotFoundError } from "@/modules/ventures";
import { AccountChrome } from "../../../_chrome/account-chrome";
import { requireActor } from "../../../actor";
import { requestAccessAction } from "./actions";
import { RequestAccessForm } from "./request-form";

export const metadata: Metadata = { title: "Request access", robots: { index: false } };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ ventureId: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Permission-denied request-access flow (Figma 54:27340, spec §12 P0). Shows nothing about the venture:
 * the page and its outcome are the same for unknown, inactive and existing ventures.
 */
export default async function RequestAccessPage({ params }: Props) {
  const { ventureId } = await params;
  if (!UUID.test(ventureId)) notFound();
  const actor = await requireActor(`/v/${ventureId}/request-access`);

  // Existing members have nothing to request (this reveals nothing they do not know).
  let isMember = true;
  try {
    await resolveVenture(actor, ventureId);
  } catch (error) {
    if (!(error instanceof VentureNotFoundError)) throw error;
    isMember = false;
  }
  if (isMember) redirect("/");

  return (
    <AccountChrome name={actor.name}>
      <RequestAccessForm action={requestAccessAction.bind(null, ventureId)} email={actor.email} />
    </AccountChrome>
  );
}
