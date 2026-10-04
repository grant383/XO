import { ButtonLink } from "@/ui";
import { SetupCard, SetupHeading } from "../parts";

/** Shown to venture members who are not the Owner. */
export function ForbiddenNotice() {
  return (
    <SetupCard>
      <SetupHeading title="You do not have permission to set up this venture">
        Only the venture Owner can complete onboarding.
      </SetupHeading>
      <ButtonLink href="/" variant="secondary">
        Go to home
      </ButtonLink>
    </SetupCard>
  );
}
