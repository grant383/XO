import { expect, test } from "@playwright/test";
import { createVerifiedUser, isolatedIp, signIn } from "./helpers";
import { expectNoA11yViolations } from "./a11y";

test.use({ extraHTTPHeaders: isolatedIp() });
test("authenticated support search, request persistence, validation and account isolation", async ({
  page,
}, testInfo) => {
  await page.goto("/support");
  await expect(page).toHaveURL(/\/auth\/login/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/support");
  const user = await createVerifiedUser(page, "support");
  await signIn(page, user, "/support");
  await expect(page.getByRole("heading", { name: "Help & Support" })).toBeVisible();
  await expectNoA11yViolations(page);
  const search = await page.getByLabel("Search help articles").boundingBox();
  const icon = await page.locator('img[src="/ui/support/search.svg"]').boundingBox();
  expect(search).not.toBeNull();
  expect(icon).not.toBeNull();
  expect(icon!.width).toBe(19);
  expect(icon!.height).toBe(19);
  expect(icon!.y).toBeGreaterThan(search!.y);
  expect(icon!.y + icon!.height).toBeLessThan(search!.y + search!.height);
  await page.screenshot({
    path: `/tmp/directorxo-support-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByLabel("Search help articles").fill("authenticator");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("Security & privacy", { exact: true })).toBeVisible();
  await expect(page.getByText("Getting started", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Create support request" }).click();
  await page.waitForURL(/\/support\?new=1#new-request$/);
  await expect(page.getByRole("button", { name: "Submit request" })).toBeVisible();
  await page.context().setOffline(true);
  await expect(page.getByRole("button", { name: "Submit request" })).toBeDisabled();
  await page.context().setOffline(false);
  await expect(page.getByRole("button", { name: "Submit request" })).toBeEnabled();
  await page.getByLabel("Subject", { exact: true }).fill("Onboarding question");
  await page.getByLabel("Description", { exact: true }).fill("Please explain financial year setup");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByRole("status")).toContainText("submitted");
  await page.goto("/support");
  await expect(page.getByText("Onboarding question", { exact: true })).toBeVisible();
  await expectNoA11yViolations(page);
  const response = await page.request.get("/api/v1/support");
  expect(response.status()).toBe(200);
  expect((await response.json()).items).toHaveLength(1);
  await page.context().clearCookies();
  expect((await page.request.get("/api/v1/support")).status()).toBe(401);
  const other = await createVerifiedUser(page, "support-other");
  await signIn(page, other, "/support");
  await expect(page.getByText("Onboarding question", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "No support requests yet" })).toBeVisible();
});
