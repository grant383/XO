import { AccountChrome } from "../../_chrome/account-chrome";
import { ForbiddenState } from "../../_chrome/error-states";

/**
 * Shown for a venture the user cannot access. Identical whether the venture exists or not
 * (no enumeration); offers the permission-denied request-access flow (spec §12).
 */
export function NoVentureAccess({ ventureId }: { ventureId: string }) {
  return (
    <AccountChrome>
      <ForbiddenState
        title="You don’t have access to this venture."
        description="If someone shared this link with you, you can ask the venture’s administrators for access. Your own ventures and data are unchanged."
        requestAccessHref={`/v/${ventureId}/request-access`}
      />
    </AccountChrome>
  );
}
