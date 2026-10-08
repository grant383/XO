import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./a11y";
import { createVerifiedUser, isolatedIp, onboardVenture, signIn } from "./helpers";

test.use({ extraHTTPHeaders: isolatedIp() });
// This journey includes cold auth/onboarding compilation on the local host.
test.setTimeout(240_000);

test("Growth Command renders the approved shell and labelled Figma fixture", async ({ page }) => {
  const owner = await createVerifiedUser(page, "growth");
  await signIn(page, owner, "/onboarding");
  const ventureId = await onboardVenture(page, "Atlas Home Services");
  await page.goto(`/v/${ventureId}/command/growth-1m`);
  await expect(page.getByRole("heading", { level: 1, name: "£1M Growth Command" })).toBeVisible();
  await expect(page.getByText("Sample data", { exact: true })).toBeVisible();
  await expect(page.getByText("£612k", { exact: false })).toBeVisible();
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(6);
  await expect(page.getByRole("button", { name: "Launch", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Conservative", exact: true })).toBeDisabled();
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() =>
      page.evaluate(() =>
        [
          ...document.querySelectorAll<HTMLImageElement>('main img[src^="/ui/growth-command/"]'),
        ].every((img) => !img.getClientRects().length || (img.complete && img.naturalWidth > 0)),
      ),
    )
    .toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (test.info().project.name === "desktop") {
    expect((await page.getByRole("complementary").boundingBox())?.width).toBe(220);
    expect((await page.getByRole("banner").boundingBox())?.height).toBe(48);
    const operate = page.getByRole("complementary").getByRole("navigation", { name: "Operate" });
    await expect(
      operate.getByRole("link", { name: "£1M Growth Command", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    for (const name of ["Command", "Growth"])
      await expect(operate.getByRole("link", { name, exact: true })).not.toHaveAttribute(
        "aria-current",
        "page",
      );
  }
  await page.addStyleTag({ content: "nextjs-portal { display:none; }" });
  await page.screenshot({
    path: `test-results/growth-command-${test.info().project.name}.png`,
    fullPage: true,
  });
  await expectNoA11yViolations(page);
  await page.getByRole("button", { name: "View assumptions" }).click();
  await expect(page.getByText(/additional leads.*922/)).toBeVisible();
  await page.getByRole("button", { name: "Close assumptions" }).click();
  await page.getByRole("link", { name: "View execution plan" }).click();
  await expect(page.getByRole("heading", { name: "This week · execution plan" })).toBeInViewport();
});

test("an outsider cannot see the growth fixture or venture name", async ({ page }) => {
  const outsider = await createVerifiedUser(page, "growth-outsider");
  await signIn(page, outsider, "/v/00000000-0000-4000-8000-000000000123/command/growth-1m");
  await expect(
    page.getByRole("heading", { name: "You don’t have access to this venture." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "£1M Growth Command" })).toHaveCount(0);
});
