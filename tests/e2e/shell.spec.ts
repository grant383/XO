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
    // Command Centre (Figma 8:651) keeps team access inside its 220px premium shell.
    await expect(sidebar.getByRole("link", { name: "Team & permissions" })).toBeVisible();

    // Tablet: the global shell's sidebar collapses to an icon rail; names stay available
    // to assistive tech. Command Centre's own shell keeps its 220px sidebar to 768px.
    await page.goto(`/v/${ventureId}/settings/team`);
    await page.setViewportSize({ width: 900, height: 900 });
    const box = await sidebar.boundingBox();
    expect(box?.width).toBe(76);
    await expect(sidebar.getByRole("link", { name: "Team & permissions" })).toHaveAttribute(
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
    await expect(
      sheet.getByRole("button", { name: /Current venture: Ridgeway Studio/ }),
    ).toBeVisible();
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

  // Account menu: account-level only, signs out. Command Centre (Figma 8:651) draws it at
  // the foot of the sidebar on desktop and of the menu sheet on mobile, never in the top
  // bar, and outside the venture navigation landmarks.
  const accountName = new RegExp(user.name);
  await expect(page.getByRole("banner").getByRole("button", { name: accountName })).toHaveCount(0);
  const mobile = info.project.name === "mobile";
  if (mobile) await page.getByRole("button", { name: "Open menu" }).click();
  const container = mobile ? page.getByRole("dialog", { name: "Menu" }) : sidebar;
  await expect(
    container.getByRole("navigation").getByRole("button", { name: accountName }),
  ).toHaveCount(0);
  const account = container.getByRole("button", { name: accountName });
  await expect(account).toHaveAccessibleName(`${user.name} Owner`);
  await expect(account).toHaveAttribute("aria-expanded", "false");

  // Keyboard: Enter opens the panel it controls; Escape closes only the panel (the mobile
  // sheet stays open) and returns focus to the trigger.
  await account.focus();
  await page.keyboard.press("Enter");
  await expect(account).toHaveAttribute("aria-expanded", "true");
  const panel = page.locator(`[id="${await account.getAttribute("aria-controls")}"]`);
  await expect(panel).toBeVisible();
  await expect(panel.getByText(user.email)).toBeVisible();
  await expect(panel.getByRole("link", { name: "Profile & Security" })).toBeVisible();
  await expectNoA11yViolations(page);
  await page.keyboard.press("Escape");
  await expect(account).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toBeHidden();
  await expect(account).toBeFocused();
  await expect(container).toBeVisible();

  await account.click();
  await panel.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/auth/login");

  // Signed out, venture routes require sign-in and return afterwards.
  await page.goto(`/v/${ventureId}/settings/team`);
  await page.waitForURL(/\/auth\/login\?next=/);
});
