import { randomInt, randomUUID } from "node:crypto";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * E2E journey helpers. Users are created through the real public API (sign-up, the
 * verification email delivered to Mailpit, sign-in): no database seeding or test-only
 * backdoors, so these journeys exercise the same auth, RBAC and RLS paths as production.
 */

const MAILPIT_API = process.env.MAILPIT_API_URL ?? "http://localhost:58025";
/** Must match playwright.config.ts; Better Auth checks the Origin of API calls. */
const ORIGIN = `http://localhost:${process.env.E2E_PORT ?? 3100}`;
export const PASSWORD = "correct-horse-battery-staple";

/**
 * A fresh TEST-NET-2 address per test file. Auth rate limits are per IP (ADR-0009); the dev
 * server keeps a client-supplied X-Forwarded-For, so files never share a limiter bucket.
 */
export const isolatedIp = () => ({
  "x-forwarded-for": `198.18.${randomInt(0, 255)}.${randomInt(1, 254)}`,
});

export const uniqueEmail = (label: string) =>
  `e2e-${label}-${randomUUID().slice(0, 12)}@example.test`;

type MailpitMessage = { ID: string; Subject: string };

/** The plain-text body of the most recent email to `to` whose subject matches. */
export async function latestEmail(
  request: APIRequestContext,
  to: string,
  subject: RegExp,
): Promise<string> {
  let found: MailpitMessage | undefined;
  await expect
    .poll(
      async () => {
        const res = await request.get(`${MAILPIT_API}/api/v1/search`, {
          params: { query: `to:"${to}"` },
        });
        const body = (await res.json()) as { messages: MailpitMessage[] };
        found = body.messages.find((m) => subject.test(m.Subject));
        return Boolean(found);
      },
      { message: `email to ${to} matching ${subject}`, timeout: 15_000 },
    )
    .toBe(true);
  const detail = await request.get(`${MAILPIT_API}/api/v1/message/${found!.ID}`);
  return ((await detail.json()) as { Text: string }).Text;
}

/** First link in an email body whose path starts with `pathPrefix`. */
export function linkFrom(text: string, pathPrefix: string): string {
  const match = new RegExp(`https?://[^\\s"'<>]*${pathPrefix}[^\\s"'<>]*`).exec(text);
  if (!match) throw new Error(`No ${pathPrefix} link in email`);
  return new URL(match[0]).pathname + new URL(match[0]).search;
}

export type TestUser = { name: string; email: string; password: string };

/** Registers through the public API and verifies via the emailed link. */
export async function createVerifiedUser(page: Page, label: string): Promise<TestUser> {
  const user = { name: `E2E ${label}`, email: uniqueEmail(label), password: PASSWORD };
  const signUp = await page.request.post("/api/v1/auth/sign-up/email", {
    data: user,
    headers: { origin: ORIGIN },
  });
  expect(signUp.status(), await signUp.text()).toBe(200);

  const verifyLink = linkFrom(
    await latestEmail(page.request, user.email, /verify/i),
    "/auth/verify-email",
  );
  const token = new URL(verifyLink, ORIGIN).searchParams.get("token")!;
  const verified = await page.request.get("/api/v1/auth/verify-email", {
    params: { token },
    headers: { origin: ORIGIN },
  });
  expect(verified.status(), await verified.text()).toBeLessThan(400);
  // Verification may sign the user in; journeys start signed out and sign in explicitly.
  await page.context().clearCookies();
  return user;
}

/** Signs in through the Figma login screen, optionally returning to `next`. */
export async function signIn(page: Page, user: TestUser, next?: string) {
  await page.goto(next ? `/auth/login?next=${encodeURIComponent(next)}` : "/auth/login");
  await page.getByLabel("Work email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth/login"));
}
