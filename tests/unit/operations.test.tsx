import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { can, VENTURE_ROLES } from "@/modules/ventures/rbac";
import { OperationsScreen } from "@/app/v/[ventureId]/(shell)/operate/operations/screen";

describe("Operations reference screen", () => {
  it("requires Operator+", () => {
    for (const role of VENTURE_ROLES) expect(can(role, "operations:view")).toBe(role !== "viewer");
    expect(can(null, "operations:view")).toBe(false);
  });
  it("labels provenance and exposes semantic job, team and capacity records", () => {
    const html = renderToStaticMarkup(<OperationsScreen />);
    expect(html).toContain("Sample data");
    expect(html).toContain("not live GS Appliance operational records");
    expect(html).toContain('aria-label="Sample operational jobs"');
    expect(html.match(/scope="row"/g)).toHaveLength(8);
    expect(html.match(/<li[ >]/g)).toHaveLength(7);
    expect(html).toContain('aria-valuenow="71"');
    expect(html).toContain("2 completed, 3 in-progress and 3 scheduled");
    expect(html).not.toContain("<form");
  });
});
