import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { can, VENTURE_ROLES } from "@/modules/ventures/rbac";
import { CrmScreen } from "@/app/v/[ventureId]/(shell)/operate/crm/screen";
import {
  DEFAULT_QUERY,
  formatDate,
  formatPounds,
  nextSort,
  queryClients,
} from "@/app/v/[ventureId]/(shell)/operate/crm/directory";
import { sampleClients, sampleSegments } from "@/app/v/[ventureId]/(shell)/operate/crm/fixtures";

const names = (query = DEFAULT_QUERY) => queryClients(sampleClients, query).map((c) => c.name);

describe("Client CRM reference", () => {
  it("restricts the CRM to Operator+", () => {
    for (const role of VENTURE_ROLES) expect(can(role, "crm:view")).toBe(role !== "viewer");
    expect(can(null, "crm:view")).toBe(false);
    expect(can(undefined, "crm:view")).toBe(false);
  });

  it("renders labelled samples with an accessible sortable directory", () => {
    const html = renderToStaticMarkup(<CrmScreen />);
    expect(html).toContain("Sample data");
    expect(html).toContain("not live GS Appliance client records");
    expect(html.match(/scope="row"/g)).toHaveLength(10);
    expect(html).toContain('aria-sort="descending"');
    expect(html).toContain('role="search"');
    expect(html).toContain('aria-label="Sample client directory"');
    expect(html).toContain("04 Sep 2026");
    expect(html).toContain("£18,400");
    expect(html).not.toContain("target target");
    expect(html).not.toContain("figma.com/api");
  });

  it("shows an empty state instead of the table when there are no clients", () => {
    const html = renderToStaticMarkup(<CrmScreen clients={[]} />);
    expect(html).toContain("No clients yet");
    expect(html).not.toContain("<table");
    expect(html).not.toContain('role="search"');
  });

  it("defaults to the reference order: highest spend first", () => {
    expect(names()).toEqual(sampleClients.map((c) => c.name));
  });

  it("searches, filters and sorts deterministically", () => {
    expect(names({ ...DEFAULT_QUERY, search: "  mrs " })).toEqual(["Mrs Patterson", "Mrs Chen"]);
    expect(names({ ...DEFAULT_QUERY, type: "Institutional" })).toEqual(["St. Mary School"]);
    expect(names({ ...DEFAULT_QUERY, status: "At Risk" })).toEqual(["Greenfield Clinic"]);
    expect(names({ ...DEFAULT_QUERY, search: "zzz" })).toEqual([]);
    // Equal last-job dates tie-break by name.
    const byDate = nextSort(DEFAULT_QUERY, "lastJob");
    expect(byDate.direction).toBe("descending");
    expect(names(byDate).slice(0, 3)).toEqual(["Mr Singh", "Mrs Chen", "Mrs Patterson"]);
    const byName = nextSort(DEFAULT_QUERY, "name");
    expect(byName.direction).toBe("ascending");
    expect(names(byName)[0]).toBe("Apex Dev Group");
    expect(names(nextSort(byName, "name"))[0]).toBe("Summit Ventures");
  });

  it("formats money and dates like the reference without time-zone drift", () => {
    expect(formatPounds(1200)).toBe("£1,200");
    expect(formatDate("2026-09-04")).toBe("04 Sep 2026");
    expect(formatDate("2026-07-15")).toBe("15 Jul 2026");
  });

  it("keeps segment shares summing to 100%", () => {
    expect(sampleSegments.reduce((sum, [, , share]) => sum + share, 0)).toBe(100);
  });
});
