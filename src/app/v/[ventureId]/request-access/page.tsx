import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { resolveVenture, VentureNotFoundError } from "@/modules/ventures";
import { requireActor } from "../../../actor";
import { requestAccessAction } from "./actions";
import { RequestAccessForm } from "./request-form";

export const metadata: Metadata = { title: "Request access", robots: { index: false } };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ ventureId: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Permission-denied request-access flow (spec §12 P0). Shows nothing about the venture:
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
    <main style={{ maxWidth: 640, margin: "48px auto", padding: "0 16px" }}>
      <h1>Request access</h1>
      <p>
        Ask this venture&apos;s administrators to give your account ({actor.email}) access. They
        choose your role when they approve.
      </p>
      <RequestAccessForm action={requestAccessAction.bind(null, ventureId)} />
      <p>
        <Link href="/">Go to home</Link>
      </p>
    </main>
  );
}
