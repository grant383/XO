import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShellNavSection } from "@/app/_shell/types";

let pathname = "/v/v1/command";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const { CommandShell } = await import("@/app/_shell/command-shell");

const venture = { id: "v1", name: "Atlas Home Services", roleLabel: "Owner" };
const ventures = [venture, { id: "v2", name: "Beta Supplies", roleLabel: "Viewer" }];
const user = { name: "Ada Owner", email: "ada@example.test" };

const operate = (extra: string[] = []): ShellNavSection => ({
  label: "Operate",
  items: [
    { href: "/v/v1/command", label: "Command", exact: true },
    { href: "/v/v1/command/growth-1m", label: "£1M Growth Command", exact: true },
    { href: "/v/v1/operate/finance", label: "Finance", exact: true },
    ...extra.map((label) => ({
      href: `/v/v1/operate/${label.toLowerCase()}`,
      label,
      exact: true,
    })),
  ],
});
const system = (team: boolean): ShellNavSection => ({
  label: "System",
  items: [
    { href: "/settings/profile-security", label: "Profile & Security" },
    ...(team ? [{ href: "/v/v1/settings/team", label: "Team & permissions" }] : []),
  ],
});

const render = (nav: ShellNavSection[]) =>
  renderToStaticMarkup(
    <CommandShell venture={venture} ventures={ventures} user={user} nav={nav}>
      <p>content</p>
    </CommandShell>,
  );
/** Navigation markup is rendered twice (sidebar and mobile menu); take the sidebar copy. */
const sidebar = (html: string) => html.slice(html.indexOf("<aside"), html.indexOf("</aside>"));
/** Links inside the sidebar's navigation landmarks (not the switcher or account popovers). */
const links = (html: string) =>
  [...sidebar(html).matchAll(/<nav [\s\S]*?<\/nav>/g)]
    .flatMap((nav) => [...nav[0].matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g)])
    .map((m) => ({
      href: m[1],
      label: m[2],
      current: m[0].includes('aria-current="page"'),
    }));

describe("CommandShell", () => {
  beforeEach(() => {
    pathname = "/v/v1/command";
  });

  it("renders the shared venture switcher with the authorised ventures", () => {
    const html = render([operate(), system(false)]);
    expect(sidebar(html)).toContain(
      'aria-label="Current venture: Atlas Home Services. Switch venture"',
    );
    expect(sidebar(html)).toContain("Beta Supplies");
    expect(sidebar(html)).toContain('href="/v/v2/command"');
  });

  it("links only destinations present in the server nav model", () => {
    const viewer = links(render([operate(), system(false)])).map((l) => l.label);
    expect(viewer).not.toContain("Operations");
    expect(viewer).not.toContain("Growth");
    expect(viewer).not.toContain("Team &amp; permissions");
    expect(viewer).toContain("Profile &amp; Security");

    const owner = links(render([operate(["Operations", "Growth"]), system(true)])).map(
      (l) => l.label,
    );
    expect(owner).toEqual(
      expect.arrayContaining(["Operations", "Growth", "Team &amp; permissions"]),
    );
    // Unshipped Figma modules stay inert.
    expect(owner).not.toContain("Idea Lab");
    expect(owner).not.toContain("Technology");
  });

  it("does not link Command destinations the role was not granted", () => {
    const html = render([system(false)]);
    expect(links(html).map((l) => l.label)).toEqual(["Profile &amp; Security"]);
    expect(sidebar(html)).toContain(
      '<span aria-disabled="true" title="Module not yet available">Command</span>',
    );
  });

  it.each([
    ["/v/v1/command", "Command"],
    ["/v/v1/command/growth-1m", "£1M Growth Command"],
    ["/v/v1/operate/finance", "Finance"],
    ["/v/v1/operate/operations", "Operations"],
    ["/v/v1/operate/growth", "Growth"],
  ])("marks only the current route on %s", (path, label) => {
    pathname = path;
    const current = links(render([operate(["Operations", "Growth"]), system(true)])).filter(
      (l) => l.current,
    );
    expect(current.map((l) => l.label)).toEqual([label]);
  });

  it("offers the same authorised destinations in the mobile menu", () => {
    const html = render([operate(["Operations", "Growth"]), system(true)]);
    const menu = html.slice(html.indexOf("<dialog"), html.indexOf("</dialog>"));
    for (const href of [
      "/v/v1/command",
      "/v/v1/operate/growth",
      "/v/v1/settings/team",
      "/settings/profile-security",
      "/v/v2/command",
    ])
      expect(menu).toContain(`href="${href}"`);
  });
});
