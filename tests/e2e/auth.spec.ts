import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./a11y";

const AUTH_PAGES = [
  { path: "/auth/login", heading: "Welcome back" },
  { path: "/auth/register", heading: "Create your account" },
  { path: "/auth/forgot-password", heading: "Reset your password" },
  { path: "/auth/reset-password?token=e2e", heading: "Set a new password" },
  { path: "/auth/verify-email?token=e2e", heading: "Verify your email address" },
];

for (const { path, heading } of AUTH_PAGES) {
  test(`${path} renders the Figma auth panel accessibly`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.getByText("Secure session")).toBeVisible();
    await expectNoA11yViolations(page);
  });
}

test("failed sign-in shows the error summary, focused, without revealing account state", async ({
  page,
}) => {
  await page.goto("/auth/login");
  await page.getByLabel("Work email").fill(`nobody-${randomUUID()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("not-the-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();

  const summary = page.getByRole("alert").filter({ hasText: "We couldn’t sign you in" });
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("Incorrect email or password.");
  await expect(summary).toBeFocused();
  await expectNoA11yViolations(page);
});

test("password reveal toggles visibility and its pressed state", async ({ page }) => {
  await page.goto("/auth/login");
  const password = page.getByLabel("Password", { exact: true });
  const reveal = page.getByRole("button", { name: "Show password" });
  await expect(password).toHaveAttribute("type", "password");
  await reveal.click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(reveal).toHaveAttribute("aria-pressed", "true");
});

test("registration ends on the check-your-inbox state and can restart", async ({ page }) => {
  const email = `e2e-${randomUUID()}@example.test`;
  await page.goto("/auth/register");
  await page.getByLabel("Full name").fill("E2E Founder");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText("Link valid for 24 hours")).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole("button", { name: "Change email" }).click();
  await expect(page.getByLabel("Work email")).toHaveValue("");
});

test("reset password rejects a mismatched confirmation before touching the token", async ({
  page,
}) => {
  await page.goto("/auth/reset-password?token=e2e");
  await page.getByLabel("New password").fill("a-long-new-passphrase");
  await page.getByLabel("Confirm password").fill("a-different-passphrase");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "We couldn’t reset your password" }),
  ).toContainText("The passwords do not match.");
});
