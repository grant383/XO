import { ForbiddenState } from "../../_chrome/error-states";

/** Shown to venture members who are not the Owner (Figma 403, 33:4456). */
export function ForbiddenNotice() {
  return (
    <ForbiddenState
      title="You don’t have permission to set up this venture."
      description="Only the venture Owner can complete onboarding. Your access to the venture is unchanged."
      required="Owner"
    />
  );
}
