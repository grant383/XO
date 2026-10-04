import Link from "next/link";
import { headers } from "next/headers";
import { getSession } from "@/modules/identity";
import { listMyVentures } from "@/modules/ventures";
import { logoutAction } from "./auth/actions";

export const dynamic = "force-dynamic";

// Placeholder until the application shell and venture switcher (later in P0).
export default async function HomePage() {
  const session = await getSession(await headers());
  if (!session) {
    return (
      <main>
        <h1>DirectorXO</h1>
        <p>
          <Link href="/auth/login">Sign in</Link> or{" "}
          <Link href="/auth/register">create an account</Link>
        </p>
      </main>
    );
  }

  const ventures = await listMyVentures({ userId: session.userId });
  const active = ventures.filter((v) => v.status === "active");
  const drafts = ventures.filter((v) => v.status === "draft" && v.role === "owner");

  return (
    <main>
      <h1>DirectorXO</h1>
      <p>Signed in as {session.name}.</p>
      <h2>Your ventures</h2>
      {active.length > 0 ? (
        <ul>
          {active.map((v) => (
            <li key={v.id}>
              {v.name} ({v.role})
            </li>
          ))}
        </ul>
      ) : (
        <p>You have no active ventures yet.</p>
      )}
      {drafts.length > 0 ? (
        <>
          <h2>Finish setting up</h2>
          <ul>
            {drafts.map((v) => (
              <li key={v.id}>
                <Link href={`/onboarding/${v.id}`}>{v.name}</Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p>
        <Link href="/onboarding">Set up a venture</Link>
      </p>
      <form action={logoutAction}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
