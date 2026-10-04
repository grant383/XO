import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./a11y";
import { createVerifiedUser, isolatedIp, onboardVenture, signIn } from "./helpers";

test.use({ extraHTTPHeaders: isolatedIp() });

/**
 * Global shell behaviour (Figma 54:24043): sidebar ≥1024, rail 768–1023, sheet <768, a
 * sticky top bar, a skip link and an account-level menu that signs out.
 */
test("shell adapts across breakpoints and keeps account controls separate", async ({
  page,
}, info) => {
  const user = await createVerifiedUser(page, "shell");
  await signIn(page, user, "/onboarding");
  const ventureId = await onboardVenture(page, "Ridgeway Studio");

  const sidebar = page.getByRole("complementary", { name: "Venture navigation" });
  if (info.project.name === "desktop") {
    await expect(sidebar).toBeVisible();
    await expect(
      sidebar.getByRole("button", { name: /Current venture: Ridgeway Studio/ }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Open menu" })).toBeHidden();

    // Tablet: the sidebar collapses to an icon rail; names stay available to assistive tech.
    await page.setViewportSize({ width: 900, height: 900 });
    const box = await sidebar.boundingBox();
    expect(box?.width).toBe(76);
    await expect(sidebar.getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expectNoA11yViolations(page);
    await page.setViewportSize({ width: 1440, height: 900 });
  } else {
    // Mobile: no sidebar; the menu sheet is a modal dialog that closes on Escape.
    await expect(sidebar).toBeHidden();
    await page.getByRole("button", { name: "Open menu" }).click();
    const sheet = page.getByRole("dialog", { name: "Menu" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Team & permissions" })).toBeVisible();
    await expectNoA11yViolations(page);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  }

  // Skip link is the first focus stop and moves focus to the main content.
  await page.goto(`/v/${ventureId}`);
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await skip.press("Enter");
  await expect(page.locator("main#main")).toBeFocused();

  // Account menu: account-level only, signs out.
  // Desktop shows the named account control; mobile a 40px avatar button.
  const account = page
    .getByRole("banner")
    .getByRole("button", { name: new RegExp(user.name) })
    .filter({ visible: true });
  await expect(account).toHaveAttribute("aria-expanded", "false");
  await account.click();
  await expect(account).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText(user.email).filter({ visible: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).filter({ visible: true }).click();
  await page.waitForURL("**/auth/login");

  // Signed out, venture routes require sign-in and return afterwards.
  await page.goto(`/v/${ventureId}/settings/team`);
  await page.waitForURL(/\/auth\/login\?next=/);
});
