import { randomUUID } from "node:crypto";
import type { Route } from "next";
import Link from "next/link";
import { listDraftOnboarding } from "@/modules/ventures";
import { Icon } from "@/ui";
import { createVentureAction } from "./actions";
import { CreateVentureForm } from "./forms";
import { requireActor, resumePath } from "./guard";
import { Divider, SetupCard, SetupHeading, onboardingStyles as styles } from "./parts";

export const dynamic = "force-dynamic";

/** Onboarding entry: resume a draft at its persisted step, or create a new venture. */
export default async function OnboardingStartPage() {
  const actor = await requireActor();
  const drafts = await listDraftOnboarding(actor);
  return (
    <SetupCard>
      <SetupHeading title="Set up a venture">
        Name the business to create a private, draft workspace. Only you can see it until you
        confirm setup.
      </SetupHeading>
      {drafts.length > 0 ? (
        <>
          <Divider />
          <section aria-labelledby="drafts-heading" className={styles.form}>
            <h2 id="drafts-heading" className={styles.sectionTitle}>
              Continue setting up
            </h2>
            <ul className={styles.drafts}>
              {drafts.map((v) => (
                <li key={v.id}>
                  <Link href={resumePath(v.id, v.currentStep) as Route} className={styles.draft}>
                    {v.name}
                    <Icon name="arrow-right-button" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
      <Divider />
      <section aria-labelledby="new-heading" className={styles.form}>
        <h2 id="new-heading" className={styles.sectionTitle}>
          New venture
        </h2>
        <CreateVentureForm action={createVentureAction} requestId={randomUUID()} />
      </section>
    </SetupCard>
  );
}
