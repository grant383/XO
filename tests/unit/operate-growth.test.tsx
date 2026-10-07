import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { can, VENTURE_ROLES } from "@/modules/ventures/rbac";
import { GrowthScreen } from "@/app/v/[ventureId]/(shell)/operate/growth/screen";
import { sampleFunnel } from "@/app/v/[ventureId]/(shell)/operate/growth/fixtures";

describe("Operate Growth reference", () => {
  it("restricts Growth to Operator+", () => {
    for (const role of VENTURE_ROLES) expect(can(role, "growth:view")).toBe(role !== "viewer");
    expect(can(null, "growth:view")).toBe(false);
    expect(can(undefined, "growth:view")).toBe(false);
  });
  it("renders labelled deterministic samples with accessible funnel and clients", () => {
    const html = renderToStaticMarkup(<GrowthScreen />);
    expect(html).toContain("Sample data");
    expect(html).toContain("not live GS Appliance growth or pipeline records");
    expect(html.match(/scope="row"/g)).toHaveLength(5);
    expect(html).toContain('aria-label="Sample top revenue clients"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('width="548" height="141"');
    expect(html).not.toContain("figma.com/api");
    expect(html).not.toContain("Last calculated");
  });
  it("keeps conversion labels consistent with the sample funnel", () => {
    for (let i = 0; i < sampleFunnel.length - 1; i++) {
      const current = Number(sampleFunnel[i][1].replaceAll(",", ""));
      const next = Number(sampleFunnel[i + 1][1].replaceAll(",", ""));
      expect(`${((next / current) * 100).toFixed(1)}%`).toBe(sampleFunnel[i][2]);
    }
  });
});
