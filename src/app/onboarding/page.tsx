import { randomUUID } from "node:crypto";
import Link from "next/link";
import { listDraftOnboarding } from "@/modules/ventures";
import { createVentureAction } from "./actions";
import { CreateVentureForm } from "./forms";
import { requireActor, resumePath } from "./guard";

export const dynamic = "force-dynamic";

/** Onboarding entry: resume a draft at its persisted step, or create a new venture. */
export default async function OnboardingStartPage() {
  const actor = await requireActor();
  const drafts = await listDraftOnboarding(actor);
  return (
    <>
      <h1>Set up a venture</h1>
      {drafts.length > 0 ? (
        <section aria-labelledby="drafts-heading">
          <h2 id="drafts-heading">Continue setting up</h2>
          <ul>
            {drafts.map((v) => (
              <li key={v.id}>
                <Link href={resumePath(v.id, v.currentStep)}>{v.name}</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section aria-labelledby="new-heading">
        <h2 id="new-heading">New venture</h2>
        <CreateVentureForm action={createVentureAction} requestId={randomUUID()} />
      </section>
    </>
  );
}
