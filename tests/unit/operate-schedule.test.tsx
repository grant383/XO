import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { can, VENTURE_ROLES } from "@/modules/ventures/rbac";
import { ScheduleScreen } from "@/app/v/[ventureId]/(shell)/operate/schedule/screen";
import {
  SAMPLE_WEEK_START,
  sampleWeek,
} from "@/app/v/[ventureId]/(shell)/operate/schedule/fixtures";
import {
  addWeeks,
  formatWeek,
  isMonday,
  workingDays,
} from "@/app/v/[ventureId]/(shell)/operate/schedule/week";

describe("Scheduling reference", () => {
  it("restricts Scheduling to Operator+", () => {
    for (const role of VENTURE_ROLES) {
      expect(can(role, "scheduling:view")).toBe(role !== "viewer");
    }
    expect(can(null, "scheduling:view")).toBe(false);
    expect(can(undefined, "scheduling:view")).toBe(false);
  });

  it("renders the labelled sample week with accessible calendar and heatmap tables", () => {
    const html = renderToStaticMarkup(<ScheduleScreen />);
    expect(html).toContain("Job Scheduling <span>· Sample data</span>");
    expect(html).toContain("not live GS Appliance jobs");
    expect(html).toContain("Week of 31 Aug 2026");
    expect(html).toContain('aria-label="Previous week"');
    expect(html).toContain('aria-label="Next week"');
    expect(html).toContain('aria-label="Sample team calendar"');
    // Five team rows in the calendar and five in the heatmap.
    expect(html.match(/scope="row"/g)).toHaveLength(10);
    // Correct weekdays: Monday is 31 Aug, Friday is 4 Sep.
    expect(html).toMatch(/>Mon<\/span><span class="[^"]*">31 Aug</);
    expect(html).toMatch(/>Fri<\/span><span class="[^"]*">4 Sep</);
    expect(html).toContain("Project: </span>Oakwood Est bathroom");
    expect(html).toContain("Flagged: </span>UNASSIGNED Job");
    expect(html).toContain("No bookings");
    expect(html).toContain(">N/A<");
    expect(html).toContain("Over</span>");
    expect(html).toContain(">HIGH<");
    expect(html).toContain('src="/ui/schedule/chevron-left.svg"');
    expect(html).not.toContain("figma.com/api");
  });

  it("shows an empty state with a way back for weeks without samples", () => {
    const html = renderToStaticMarkup(
      <ScheduleScreen initialWeek={addWeeks(SAMPLE_WEEK_START, 1)} />,
    );
    expect(html).toContain("Week of 7 Sep 2026");
    expect(html).toContain("No sample jobs this week");
    expect(html).toContain("Back to sample week");
    expect(html).not.toContain("<table");
  });

  it("shows an empty state without the return action when there are no bookings at all", () => {
    const html = renderToStaticMarkup(<ScheduleScreen weeks={{}} />);
    expect(html).toContain("No sample jobs this week");
    expect(html).not.toContain("Back to sample week");
    expect(html).not.toContain("<table");
  });

  it("does week arithmetic across month and year boundaries without time-zone drift", () => {
    expect(isMonday(SAMPLE_WEEK_START)).toBe(true);
    expect(addWeeks(SAMPLE_WEEK_START, -1)).toBe("2026-08-24");
    expect(addWeeks("2026-12-28", 1)).toBe("2027-01-04");
    expect(formatWeek("2026-12-28")).toBe("Week of 28 Dec 2026");
    expect(workingDays("2026-12-28").map((d) => `${d.weekday} ${d.label}`)).toEqual([
      "Mon 28 Dec",
      "Tue 29 Dec",
      "Wed 30 Dec",
      "Thu 31 Dec",
      "Fri 1 Jan",
    ]);
    expect(workingDays(SAMPLE_WEEK_START).every((d) => !d.label.includes("Sept"))).toBe(true);
  });

  it("keeps the fixture aligned with the disclosed sample notes", () => {
    expect(sampleWeek.capacity.map((c) => c.name)).toEqual(sampleWeek.members.map((m) => m.name));
    const bookings = sampleWeek.members.flatMap((m) => m.days.flat());
    expect(bookings.filter((b) => b.kind !== "internal")).toHaveLength(21);
    expect(bookings.filter((b) => b.label.startsWith("UNASSIGNED"))).toHaveLength(1);
  });
});
