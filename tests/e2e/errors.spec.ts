import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./a11y";

/** Canonical error routes (spec §5 `/errors/*`, Figma 33:4456, 31:3604, 31:3692). */
const STATES = [
  { path: "/errors/403", status: 200, code: "Error 403 · Permission required" },
  { path: "/errors/404", status: 404, code: "Error 404" },
  { path: "/errors/500", status: 200, code: "Error 500" },
  { path: "/no/such/route", status: 404, code: "Error 404" },
];

for (const { path, status, code } of STATES) {
  test(`${path} renders the Figma error state accessibly`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(status);
    await expect(page.getByText(code, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to DirectorXO" })).toHaveAttribute("href", "/");
    await expectNoA11yViolations(page);
  });
}

test("the 404 state shows the requested path and offers a way back", async ({ page }) => {
  await page.goto("/errors/403");
  await page.goto("/v/not-a-uuid/settings/team");
  await expect(page.getByText("/v/not-a-uuid/settings/team")).toBeVisible();
  await page.getByRole("button", { name: "Go back" }).click();
  await page.waitForURL("**/errors/403");
});
