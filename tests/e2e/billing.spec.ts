import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./a11y";
import { createVerifiedUser, isolatedIp, onboardVenture, signIn } from "./helpers";
import { mirrorSubscription } from "./billing-mirror";
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

const STATES = [
  { status: "active", label: "Active", period: "Current period ends", enabled: true },
  { status: "trialing", label: "Trial", period: "Current period ends", enabled: true },
  {
    status: "active",
    cancelAtPeriodEnd: true,
    label: "Active",
    period: "Ends at period close",
    enabled: true,
  },
  {
    status: "past_due",
    label: "Past due",
    period: "Current period ends",
    enabled: false,
    notice: /Payment is overdue/,
  },
  {
    status: "unpaid",
    label: "Unpaid",
    period: "Current period ends",
    enabled: false,
    notice: /Payment failed/,
  },
  {
    status: "incomplete",
    label: "Incomplete",
    period: "Current period ends",
    enabled: false,
    notice: /first payment has not completed/,
  },
  {
    status: "paused",
    label: "Paused",
    period: "Current period ends",
    enabled: false,
    notice: /paused/,
  },
  {
    status: "canceled",
    label: "Canceled",
    period: "Ended",
    enabled: false,
    notice: /subscription has ended/,
  },
  {
    status: "incomplete_expired",
    label: "Expired",
    period: "Ended",
    enabled: false,
    notice: /not completed in time/,
  },
] as const;

test("every mirrored subscription state renders its status, consequence and actions", async ({
  page,
}, testInfo) => {
  const owner = await createVerifiedUser(page, "billing-states");
  await signIn(page, owner, "/settings/profile-security");
  const ventureName = `Billing states ${testInfo.project.name}`;
  await onboardVenture(page, ventureName);
  const { accounts } = await (await page.request.get("/api/v1/billing")).json();
  const accountId: string = accounts[0].id;

  for (const state of STATES) {
    await test.step(`${state.status}${"cancelAtPeriodEnd" in state ? " (cancel at period end)" : ""}`, async () => {
      await mirrorSubscription(accountId, state);
      await page.goto("/settings/billing");
      const plan = page.locator("section", { has: page.getByText("Current plan") });
      await expect(plan.getByRole("heading", { name: "DirectorXO subscription" })).toBeVisible();
      await expect(plan.getByText(state.label, { exact: true })).toBeVisible();
      await expect(plan.getByText("£149.00")).toBeVisible();
      await expect(plan.getByText("/ month")).toBeVisible();
      await expect(plan.getByText(state.period, { exact: true })).toBeVisible();
      if ("notice" in state) await expect(plan.getByRole("status")).toHaveText(state.notice);
      else await expect(plan.getByRole("status")).toHaveCount(0);

      const linked = page.locator("section", { has: page.getByText("Venture entitlements") });
      const row = linked.getByRole("listitem").filter({ hasText: ventureName });
      await expect(row.getByText(state.enabled ? "Enabled" : "Not enabled")).toBeVisible();

      // Ended subscriptions offer a new checkout; live ones are managed in the hosted portal.
      // The provider is unconfigured locally, so every provider action stays disabled.
      const ended = state.status === "canceled" || state.status === "incomplete_expired";
      const primary = page.getByRole("button", {
        name: ended ? "Start subscription" : "Manage plan",
      });
      await expect(primary).toBeDisabled();
      for (const name of ["Update payment method", "View invoices", "Review cancellation"]) {
        await expect(page.getByRole("button", { name })).toBeDisabled();
      }
      const api = await (await page.request.get(`/api/v1/billing?accountId=${accountId}`)).json();
      expect(api.subscription.status).toBe(state.status);
      if (state.status === "past_due" || state.status === "active") {
        await expectNoA11yViolations(page);
      }
    });
  }
  await page.screenshot({
    path: `/tmp/directorxo-billing-states-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
