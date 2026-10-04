import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/modules/identity";
import { listSwitchableVentures } from "@/modules/ventures";

export const dynamic = "force-dynamic";

/**
 * Entry point. Signed-out visitors sign in; signed-in users land in their first active
 * venture (the shell's switcher moves between ventures), or in onboarding when they have
 * none. `/v/[ventureId]` re-authorises the venture on every request.
 */
export default async function HomePage() {
  const session = await getSession(await headers());
  if (!session) redirect("/auth/login");
  const [first] = await listSwitchableVentures({ userId: session.userId });
  redirect((first ? `/v/${first.id}` : "/onboarding") as Route);
}
