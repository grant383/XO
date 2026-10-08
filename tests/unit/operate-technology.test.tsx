import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { can, VENTURE_ROLES } from "@/modules/ventures/rbac";
import { TechnologyScreen } from "@/app/v/[ventureId]/(shell)/operate/technology/screen";
import {
  sampleAlerts,
  sampleServices,
} from "@/app/v/[ventureId]/(shell)/operate/technology/fixtures";

describe("Operate Technology reference", () => {
  it("restricts Technology to Operator+", () => {
    for (const role of VENTURE_ROLES) expect(can(role, "technology:view")).toBe(role !== "viewer");
    expect(can(null, "technology:view")).toBe(false);
    expect(can(undefined, "technology:view")).toBe(false);
  });
  it("renders labelled deterministic samples with an accessible service table", () => {
    const html = renderToStaticMarkup(<TechnologyScreen />);
    expect(html).toContain("Sample data");
    expect(html).toContain("not live GS Appliance technology records");
    expect(html.match(/scope="row"/g)).toHaveLength(8);
    expect(html.match(/scope="col"/g)).toHaveLength(6);
    expect(html).toContain('aria-label="Sample integration and service health"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain(`Active Alerts (${sampleAlerts.length})`);
    expect(html).toMatch(/<abbr class="[^"]+" title="Degraded">DEG<\/abbr>/);
    expect(html).toMatch(/<abbr class="[^"]+" title="Information">INFO<\/abbr>/);
    for (const asset of ["cpu", "memory", "storage", "bandwidth"])
      expect(html).toContain(`/ui/technology/${asset}.svg`);
    expect(html).not.toContain("figma.com/api");
  });
  it("keeps service status and health labels consistent", () => {
    for (const [, status, , , , health] of sampleServices)
      expect(health).toBe(status === "Degraded" ? "warning" : "healthy");
    expect(sampleServices.filter(([, status]) => status === "Degraded")).toHaveLength(1);
  });
});
