import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./a11y";
import { createVerifiedUser, isolatedIp, onboardVenture, signIn } from "./helpers";
test.use({ extraHTTPHeaders: isolatedIp() });
test("real billing ownership, unconfigured provider state and account isolation", async ({
  page,
}, testInfo) => {
  const owner = await createVerifiedUser(page, "billing-owner");
  await signIn(page, owner, "/settings/profile-security");
  await onboardVenture(page, `Billing ${testInfo.project.name}`);
  await page.goto("/settings/billing");
  await expect(page.getByRole("heading", { name: "Billing & Subscription" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No subscription", exact: true })).toBeVisible();
  await expect(
    page.getByText("Subscription billing is not configured.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Start subscription" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Update payment method" })).toBeDisabled();
  await expectNoA11yViolations(page);
  await page.screenshot({
    path: `/tmp/directorxo-billing-${testInfo.project.name}.png`,
    fullPage: true,
  });
  const own = await (await page.request.get("/api/v1/billing")).json();
  expect(own.accounts).toHaveLength(1);
  const accountId = own.accounts[0].id;
  const overview = await page.request.get(`/api/v1/billing?accountId=${accountId}`);
  expect(overview.status()).toBe(200);
  expect((await overview.json()).subscription).toBeNull();
  expect(
    (
      await page.request.post("/api/v1/billing", {
        data: { accountId, requestId: crypto.randomUUID(), action: "checkout" },
        headers: { origin: "http://localhost:3100" },
      })
    ).status(),
  ).toBe(503);
  await page.context().clearCookies();
  expect((await page.request.get("/api/v1/billing")).status()).toBe(401);
  const other = await createVerifiedUser(page, "billing-other");
  await signIn(page, other, "/settings/billing");
  await expect(page.getByRole("heading", { name: "Billing ownership required" })).toBeVisible();
  expect((await page.request.get(`/api/v1/billing?accountId=${accountId}`)).status()).toBe(403);
});
