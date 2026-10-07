import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./a11y";
import { createVerifiedUser, isolatedIp } from "./helpers";

test.use({ extraHTTPHeaders: isolatedIp() });
test("canonical login error allows a real retry and retains a safe return path", async ({
  page,
}) => {
  const user = await createVerifiedUser(page, "error-retry");
  await page.goto("/auth/login/error?next=%2Fsettings%2Fprofile-security");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("We couldn’t sign you in");
  await expectNoA11yViolations(page);
  await page.getByLabel("Work email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Try again" }).click();
  await page.waitForURL(/\/settings\/profile-security$/);
  await expect(page.getByRole("heading", { name: "Profile & Security" })).toBeVisible();
});
