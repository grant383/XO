import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./a11y";
import { createVerifiedUser, isolatedIp, signIn } from "./helpers";

test.use({ extraHTTPHeaders: isolatedIp() });
test("real account events, read state, API isolation and responsive inbox", async ({
  page,
}, testInfo) => {
  const user = await createVerifiedUser(page, "inbox");
  await signIn(page, user, "/settings/notifications-activity");
  await expect(page.getByRole("heading", { name: "Notifications & Activity" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Signed in" }).first()).toBeVisible();
  await expectNoA11yViolations(page);
  await page.screenshot({
    path: `/tmp/directorxo-inbox-${testInfo.project.name}.png`,
    fullPage: true,
  });
  const inbox = await page.request.get("/api/v1/notifications");
  expect(inbox.status()).toBe(200);
  const before = await inbox.json();
  expect(before.unread).toBeGreaterThan(0);
  expect(JSON.stringify(before)).not.toMatch(/ipAddress|metadata|userAgent|sessionToken/);
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(page.getByText("Notifications marked as read.", { exact: true })).toBeVisible({
    timeout: 60000,
  });
  await expect(page.getByRole("button", { name: "Mark all as read" })).toBeDisabled();
  await page.reload();
  expect((await (await page.request.get("/api/v1/notifications")).json()).unread).toBe(0);
  await page.getByRole("link", { name: /^Unread \(0\)/ }).click();
  await expect(page.getByRole("heading", { name: "You’re all caught up" })).toBeVisible();
  await page.context().clearCookies();
  expect((await page.request.get("/api/v1/notifications")).status()).toBe(401);
  const other = await createVerifiedUser(page, "inbox-other");
  await signIn(page, other, "/settings/notifications-activity");
  const own = await (await page.request.get("/api/v1/notifications")).json();
  expect(
    own.items.every(
      (n: { id: string }) => !before.items.some((old: { id: string }) => old.id === n.id),
    ),
  ).toBe(true);
});
