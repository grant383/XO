import Link from "next/link";
import { headers } from "next/headers";
import { getSession } from "@/modules/identity";
import { logoutAction } from "./auth/actions";

export const dynamic = "force-dynamic";

// Placeholder until the application shell (P0 step 10); shows the authenticated identity.
export default async function HomePage() {
  const session = await getSession(await headers());
  return (
    <main>
      <h1>DirectorXO</h1>
      {session ? (
        <>
          <p>Signed in as {session.name}.</p>
          <form action={logoutAction}>
            <button type="submit">Sign out</button>
          </form>
        </>
      ) : (
        <p>
          <Link href="/auth/login">Sign in</Link> or{" "}
          <Link href="/auth/register">create an account</Link>
        </p>
      )}
    </main>
  );
}
