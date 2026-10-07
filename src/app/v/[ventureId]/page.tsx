import type { Route } from "next";
import { notFound, redirect } from "next/navigation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = { params: Promise<{ ventureId: string }> };

/**
 * The venture's landing page is Command Centre (spec §4, §10). This redirect reveals
 * nothing: `/v/[ventureId]/command` authenticates and authorises the venture itself.
 */
export default async function VentureIndexPage({ params }: Props) {
  const { ventureId } = await params;
  if (!UUID.test(ventureId)) notFound();
  redirect(`/v/${ventureId}/command` as Route);
}
