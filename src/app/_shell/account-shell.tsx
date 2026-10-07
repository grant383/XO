import type { ReactNode } from "react";
import { listSwitchableVentures, ROLE_LABELS } from "@/modules/ventures";
import { AppShell } from "./app-shell";
import { requireActor } from "../actor";

/**
 * Account settings shell (`/settings/*`, spec §5). Account-level: no venture is in
 * context, so the switcher only offers the user's active ventures and every page reads
 * the signed-in user's own data. Each page still authenticates on its own.
 */
export async function AccountShell({ children, next }: { children: ReactNode; next: string }) {
  const actor = await requireActor(next);
  const ventures = await listSwitchableVentures(actor);
  return (
    <AppShell
      venture={null}
      ventures={ventures.map((v) => ({ id: v.id, name: v.name, roleLabel: ROLE_LABELS[v.role] }))}
      user={{ name: actor.name, email: actor.email }}
      nav={[
        {
          label: "Account",
          items: [
            { href: "/settings/profile-security", label: "Profile & Security" },
            { href: "/settings/notifications-activity", label: "Notifications & Activity" },
            { href: "/settings/billing", label: "Billing & Subscription" },
            { href: "/support", label: "Help & Support" },
          ],
        },
      ]}
    >
      {children}
    </AppShell>
  );
}
