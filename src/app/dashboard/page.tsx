import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/modules/identity";
import { listSwitchableVentures } from "@/modules/ventures";
import { signInPath } from "../actor";

export const dynamic = "force-dynamic";

/**
 * Legacy DirectorXO dashboard (Figma 3:255, deprecated; spec §10): redirects to Command
 * Centre for the user's first accessible active venture and owns no data. The redirect is
 * temporary (307), not 301/308: its target depends on who is signed in, so a browser must
 * not cache it across accounts.
 */
export default async function LegacyDashboardPage() {
  const h = await headers();
  const session = await getSession(h);
  if (!session) redirect(await signInPath(h, "/dashboard"));
  const [first] = await listSwitchableVentures({ userId: session.userId });
  redirect((first ? `/v/${first.id}/command` : "/onboarding") as Route);
}
