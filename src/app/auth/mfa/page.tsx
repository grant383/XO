import type { Metadata, Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  getSession,
  hasMfaChallenge,
  MFA_POLICY,
  safeNextPath,
  withNext,
} from "@/modules/identity";
import { AuthShell, STORIES } from "../auth-shell";
import { MfaChallenge } from "./mfa-challenge";

export const metadata: Metadata = { title: "Two-step verification" };

type Props = { searchParams: Promise<{ next?: string | string[] }> };

/**
 * Figma 54:27145. The second sign-in step for an account with MFA. Reachable only with
 * the signed challenge cookie set by a correct password; the challenge itself (signature,
 * 10-minute expiry, attempts) is validated by the identity flow on every submission.
 */
export default async function MfaPage({ searchParams }: Props) {
  const next = safeNextPath((await searchParams).next);
  const h = await headers();
  if (await getSession(h)) redirect((next ?? "/") as Route);
  if (!(await hasMfaChallenge(h))) redirect(withNext("/auth/login", next) as Route);
  return (
    <AuthShell story={STORIES.mfa}>
      <MfaChallenge next={next} digits={MFA_POLICY.digits} periodSec={MFA_POLICY.periodSec} />
    </AuthShell>
  );
}
