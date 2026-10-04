import { expect, test, type Page } from "@playwright/test";
import { totp } from "../helpers/totp";
import { expectNoA11yViolations } from "./a11y";
import {
  createVerifiedUser,
  isolatedIp,
  latestEmail,
  linkFrom,
  PASSWORD,
  signIn,
  type TestUser,
} from "./helpers";

test.use({ extraHTTPHeaders: isolatedIp() });

const ORIGIN = `http://localhost:${process.env.E2E_PORT ?? 3100}`;

/**
 * Step 6 journeys (ADR-0016): MFA challenge with an authenticator code and with a backup
 * code, session expiry after revocation, and the password-reset success screen.
 */

/** Turns MFA on through the public API for the signed-in browser; returns key and codes. */
async function enrolMfa(page: Page, user: TestUser) {
  const enable = await page.request.post("/api/v1/auth/two-factor/enable", {
    data: { password: user.password, method: "totp" },
    headers: { origin: ORIGIN },
  });
  expect(enable.status(), await enable.text()).toBe(200);
  const body = (await enable.json()) as { totpURI: string; backupCodes: string[] };
  const manualKey = new URL(body.totpURI).searchParams.get("secret")!;
  const confirm = await page.request.post("/api/v1/auth/two-factor/verify-totp", {
    data: { code: totp(manualKey) },
    headers: { origin: ORIGIN },
  });
  expect(confirm.status(), await confirm.text()).toBe(200);
  return { manualKey, backupCodes: body.backupCodes };
}

test("MFA: sign-in stops at the challenge until a valid authenticator code", async ({ page }) => {
  const user = await createVerifiedUser(page, "mfa");
  await signIn(page, user, "/onboarding");
  const { manualKey } = await enrolMfa(page, user);
  await page.context().clearCookies();

  await signIn(page, user, "/onboarding");
  await expect(page).toHaveURL(/\/auth\/mfa\?next=%2Fonboarding$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Enter your authenticator code" }),
  ).toBeVisible();
  await expectNoA11yViolations(page);

  // No session yet: protected pages still send the visitor to sign in.
  const probe = await page.request.get("/api/v1/auth/get-session");
  expect(await probe.json()).toBeNull();

  const code = page.getByLabel("Authentication code");
  await expect(code).toBeFocused();
  await code.fill("000000");
  await page.getByRole("button", { name: "Verify and continue" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "That code didn’t work" });
  await expect(alert).toBeVisible();
  await expect(page.locator("#mfa-error")).toBeFocused();
  await expect(code).toHaveAttribute("aria-invalid", "true");
  await expectNoA11yViolations(page);

  await code.fill(totp(manualKey, 1));
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await page.waitForURL(/\/onboarding$/);
});

test("MFA: a backup code completes sign-in once", async ({ page }) => {
  const user = await createVerifiedUser(page, "mfa-backup");
  await signIn(page, user, "/onboarding");
  const { backupCodes } = await enrolMfa(page, user);
  await page.context().clearCookies();

  await signIn(page, user);
  await page.getByRole("button", { name: "Use a backup code" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Use a backup code" })).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByLabel("Backup code").fill(backupCodes[0]!);
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth/"));

  // The same code cannot be used again.
  await page.context().clearCookies();
  await signIn(page, user);
  await page.getByRole("button", { name: "Use a backup code" }).click();
  await page.getByLabel("Backup code").fill(backupCodes[0]!);
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "That code didn’t work" })).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/mfa/);
});

test("MFA challenge page requires a pending sign-in", async ({ page }) => {
  await page.goto("/auth/mfa?next=/onboarding");
  await expect(page).toHaveURL(/\/auth\/login\?next=%2Fonboarding$/);
});

test("a revoked session lands on session expired and keeps the destination", async ({
  page,
  browser,
}) => {
  const user = await createVerifiedUser(page, "expired");
  await signIn(page, user, "/onboarding");
  await expect(page).toHaveURL(/\/onboarding$/);

  // Another device signs out every other session.
  const other = await browser.newContext({ extraHTTPHeaders: isolatedIp(), baseURL: ORIGIN });
  const signInOther = await other.request.post("/api/v1/auth/sign-in/email", {
    data: { email: user.email, password: user.password },
    headers: { origin: ORIGIN },
  });
  expect(signInOther.status()).toBe(200);
  const revoke = await other.request.post("/api/v1/auth/revoke-other-sessions", {
    data: {},
    headers: { origin: ORIGIN },
  });
  expect(revoke.status(), await revoke.text()).toBe(200);
  await other.close();

  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/auth\/session-expired\?next=%2Fonboarding$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Your session has expired" }),
  ).toBeVisible();
  await expect(page.getByText("Return destination saved")).toBeVisible();
  await expect(
    page.getByText(/after 7 days without activity, 30 days after sign-in/),
  ).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole("link", { name: "Return to login" }).click();
  await expect(page).toHaveURL(/\/auth\/login\?next=%2Fonboarding$/);
});

test("a visitor who never signed in goes to login, not session expired", async ({ page }) => {
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/auth\/login/);
});

test("password reset ends on the success screen and the new password works", async ({ page }) => {
  const user = await createVerifiedUser(page, "reset");
  await page.goto("/auth/forgot-password");
  await page.getByLabel("Work email").fill(user.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/If an account exists for that address/)).toBeVisible();

  const link = linkFrom(
    await latestEmail(page.request, user.email, /reset your directorxo password/i),
    "/auth/reset-password",
  );
  await page.goto(link);
  const newPassword = `${PASSWORD}-renewed`;
  await page.getByLabel("New password").fill(newPassword);
  await page.getByLabel("Confirm password").fill(newPassword);
  await page.getByRole("button", { name: "Save new password" }).click();

  await page.waitForURL(/\/auth\/reset-password\/success$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Password reset successful" }),
  ).toBeVisible();
  await expect(page.getByText("All other sessions signed out")).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole("link", { name: "Return to login" }).click();
  await signIn(page, { ...user, password: newPassword }, "/onboarding");
  await expect(page).toHaveURL(/\/onboarding$/);
});
