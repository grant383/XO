import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./a11y";
import {
  createVerifiedUser,
  isolatedIp,
  latestEmail,
  linkFrom,
  onboardVenture,
  signIn,
} from "./helpers";

test.use({ extraHTTPHeaders: isolatedIp() });
test.setTimeout(240_000);

test("Operations reference render and accessibility", async ({ page }) => {
  const owner = await createVerifiedUser(page, "operations");
  await signIn(page, owner, "/onboarding");
  const ventureId = await onboardVenture(page, "Atlas Home Services");
  await page.goto(`/v/${ventureId}/operate/operations`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Operations · Sample data" }),
  ).toBeVisible();
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(9);
  await expect(
    page.getByRole("region", { name: "Field team status" }).getByRole("listitem"),
  ).toHaveCount(7);
  await expect(page.getByText("£5,470", { exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect
    .poll(() =>
      page.locator("main img").evaluateAll((images) =>
        images.every((image) => {
          const img = image as HTMLImageElement;
          return img.complete && img.naturalWidth > 0;
        }),
      ),
    )
    .toBe(true);
  if (test.info().project.name === "desktop") {
    await expect(page.getByRole("link", { name: "Operations", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect((await page.getByRole("complementary").boundingBox())?.width).toBe(220);
    for (const [name, x, width] of [
      ["Today's job board", 252, 1156],
      ["Field team status", 252, 732],
      ["Today's revenue", 1008, 400],
    ] as const) {
      const box = await page.getByRole("region", { name, exact: true }).boundingBox();
      expect(box?.x).toBe(x);
      expect(box?.width).toBe(width);
    }
    const assets = await page.locator("main img").evaluateAll((images) =>
      images.map((image) => ({
        width: image.getBoundingClientRect().width,
        height: image.getBoundingClientRect().height,
        expectedWidth: Number(image.getAttribute("width")),
        expectedHeight: Number(image.getAttribute("height")),
      })),
    );
    for (const asset of assets) {
      expect(asset.width).toBe(asset.expectedWidth);
      expect(asset.height).toBe(asset.expectedHeight);
    }
  }
  await page.addStyleTag({ content: "nextjs-portal {display:none;}" });
  await page.screenshot({ path: `docs/verification/operations/${test.info().project.name}.png` });
  await page.screenshot({
    path: `docs/verification/operations/${test.info().project.name}-full.png`,
    fullPage: true,
  });
  await expectNoA11yViolations(page);
  await page.getByText("Sample records & source notes", { exact: true }).click();
  await expect(page.getByText(/not live GS Appliance operational records/)).toBeVisible();
  await expectNoA11yViolations(page);
  if (test.info().project.name === "mobile") {
    const region = page.getByRole("region", { name: "Sample job board", exact: true });
    await region.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(
      page.getByRole("dialog").getByRole("link", { name: "Operations", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Close menu" }).click();
  }
});

test("Operations admits Operator and denies Viewer, outsider and unknown venture", async ({
  page,
  browser,
}) => {
  const owner = await createVerifiedUser(page, "operations-owner");
  await signIn(page, owner, "/onboarding");
  const ventureId = await onboardVenture(page, "Operations private venture");
  for (const role of ["operator", "viewer"] as const) {
    const context = await browser.newContext({ extraHTTPHeaders: isolatedIp() });
    const memberPage = await context.newPage();
    const member = await createVerifiedUser(memberPage, `operations-${role}`);
    await page.goto(`/v/${ventureId}/settings/team`);
    await page.getByLabel("Email address").fill(member.email);
    await page.getByLabel("Role", { exact: true }).selectOption(role);
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Invitation sent" })).toBeVisible();
    const link = linkFrom(await latestEmail(page.request, member.email, /invit/i), "/invite/");
    await signIn(memberPage, member, link);
    await memberPage.getByRole("button", { name: "Accept invitation and continue" }).click();
    await memberPage.waitForURL(`**/v/${ventureId}/command`);
    await memberPage.goto(`/v/${ventureId}/operate/operations`);
    if (role === "operator") {
      await expect(
        memberPage.getByRole("heading", { level: 1, name: "Operations · Sample data" }),
      ).toBeVisible();
      await expect(memberPage.getByRole("table")).toHaveCount(1);
    } else {
      await expect(
        memberPage.getByRole("heading", { name: "You don’t have access to this venture." }),
      ).toBeVisible();
      await expect(memberPage.getByRole("table")).toHaveCount(0);
      await expect(memberPage.getByText("£5,470")).toHaveCount(0);
    }
    await expectNoA11yViolations(memberPage);
    await context.close();
  }
  const context = await browser.newContext({ extraHTTPHeaders: isolatedIp() });
  const outsiderPage = await context.newPage();
  const outsider = await createVerifiedUser(outsiderPage, "operations-outsider");
  await signIn(outsiderPage, outsider, `/v/${ventureId}/operate/operations`);
  await expect(
    outsiderPage.getByRole("heading", { name: "You don’t have access to this venture." }),
  ).toBeVisible();
  await expect(outsiderPage.getByText("Operations private venture")).toHaveCount(0);
  await expect(outsiderPage.getByRole("table")).toHaveCount(0);
  await outsiderPage.goto("/v/00000000-0000-4000-8000-000000000123/operate/operations");
  await expect(
    outsiderPage.getByRole("heading", { name: "You don’t have access to this venture." }),
  ).toBeVisible();
  await context.close();
});
