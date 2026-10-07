import { describe, expect, it } from "vitest";
import {
  clockTime,
  commandMetrics,
  createTaskInput,
  dueLabel,
  evaluateSignals,
  formatChange,
  formatMetricValue,
  localDate,
  longDate,
  METRICS,
  relativeTime,
  taskStatusInput,
} from "@/modules/command";

const LONDON = "Europe/London";

describe("venture calendar (Command Centre)", () => {
  it("uses the venture timezone for today, not UTC", () => {
    // 23:30 UTC on 30 Sep is already 1 Oct in London (BST) and still 30 Sep in New York.
    const at = new Date("2026-09-30T23:30:00Z");
    expect(localDate(at, LONDON)).toBe("2026-10-01");
    expect(localDate(at, "America/New_York")).toBe("2026-09-30");
    expect(clockTime(at, LONDON)).toBe("00:30");
  });

  it("formats the Figma header date", () => {
    expect(longDate(new Date("2026-09-04T09:00:00Z"), LONDON)).toBe("Friday 4 Sep 2026");
  });

  it.each([
    [null, { label: "No date", overdue: false }],
    ["2026-10-07", { label: "Today", overdue: false }],
    ["2026-10-08", { label: "Tomorrow", overdue: false }],
    ["2026-10-09", { label: "Friday", overdue: false }],
    ["2026-10-13", { label: "Tuesday", overdue: false }],
    ["2026-10-14", { label: "14 Oct", overdue: false }],
    ["2027-01-05", { label: "5 Jan 2027", overdue: false }],
    ["2026-10-03", { label: "Overdue · 3 Oct", overdue: true }],
  ])("labels due date %s relative to 7 Oct 2026", (dueOn, expected) => {
    expect(dueLabel(dueOn, "2026-10-07")).toEqual(expected);
  });

  it("describes recent changes relative to now in the venture timezone", () => {
    const now = new Date("2026-10-07T14:00:00Z");
    const ago = (ms: number) => relativeTime(new Date(now.getTime() - ms), now, LONDON);
    expect(ago(20_000)).toBe("Just now");
    expect(ago(25 * 60_000)).toBe("25m ago");
    expect(ago(2 * 3_600_000)).toBe("2h ago");
    expect(ago(20 * 3_600_000)).toBe("Yesterday");
    expect(ago(5 * 86_400_000)).toBe("2 Oct");
  });
});

describe("Command metrics", () => {
  it("keeps the six Figma tiles in order and reports no figure without a source", () => {
    expect(METRICS.map((m) => m.label)).toEqual([
      "Revenue MTD",
      "Jobs completed",
      "Pipeline value",
      "Avg job value",
      "Customer sat",
      "Cash position",
    ]);
    const metrics = commandMetrics();
    expect(metrics.every((m) => m.status === "awaiting_source")).toBe(true);
    expect(metrics.some((m) => "value" in m)).toBe(false);
  });

  it("formats money from integer minor units, counts and scores", () => {
    expect(formatMetricValue("money", 3_842_000, "GBP")).toBe("£38,420");
    expect(formatMetricValue("money", 20_549, "EUR")).toBe("€205");
    expect(formatMetricValue("count", 1870, "GBP")).toBe("1,870");
    expect(formatMetricValue("score", 4.7, "GBP")).toBe("4.7");
  });

  it("states the change direction in text, not only colour", () => {
    expect(formatChange(0.12)).toEqual({ text: "▲ +12%", direction: "up" });
    expect(formatChange(-0.034)).toEqual({ text: "▼ -3%", direction: "down" });
    expect(formatChange(0.001)).toEqual({ text: "• 0%", direction: "flat" });
  });
});

describe("Command signals (deterministic rules, spec §13.14)", () => {
  const at = new Date("2026-10-07T12:00:00Z");
  const today = "2026-10-07";
  const metrics = commandMetrics();

  it("golden: overdue, due-today and unconnected-source rules with evidence", () => {
    const signals = evaluateSignals(
      {
        today,
        metrics,
        openTasks: [
          { priority: "high", dueOn: "2026-10-01" },
          { priority: "low", dueOn: "2026-10-05" },
          { priority: "high", dueOn: today },
          { priority: "medium", dueOn: null },
        ],
      },
      at,
    );
    expect(signals).toEqual([
      {
        ruleId: "command.tasks.overdue",
        ruleVersion: 1,
        severity: "danger",
        title: "2 tasks overdue",
        detail: "The oldest was due on 1 Oct. 1 of them is high priority.",
        action: "Complete them, or confirm with the team that they are still needed.",
        threshold: "1 or more open tasks past their due date",
        evidence: [
          { label: "Overdue open tasks", value: "2" },
          { label: "High priority", value: "1" },
          { label: "Oldest due date", value: "2026-10-01" },
        ],
        evaluatedAt: at,
      },
      {
        ruleId: "command.tasks.high_priority_due_today",
        ruleVersion: 1,
        severity: "warning",
        title: "1 high-priority task due today",
        detail:
          "These are still open and fall due before the end of today in the venture’s timezone.",
        action: "Prioritise them before other open work.",
        threshold: "1 or more open high-priority tasks due today",
        evidence: [
          { label: "High-priority tasks due today", value: "1" },
          { label: "Venture date", value: today },
        ],
        evaluatedAt: at,
      },
      {
        ruleId: "command.metrics.awaiting_sources",
        ruleVersion: 1,
        severity: "info",
        title: "Business metrics are not connected yet",
        detail:
          "6 of 6 Command metrics have no connected source, so revenue, pipeline and cash rules cannot run.",
        action:
          "Figures and their rules appear here as Finance, Operations and Growth records become available.",
        threshold: "1 or more Command metrics without a connected source",
        evidence: metrics.map((m) => ({ label: m.label, value: m.source })),
        evaluatedAt: at,
      },
    ]);
  });

  it("downgrades overdue work without high priority to a warning", () => {
    const [overdue] = evaluateSignals(
      { today, metrics: [], openTasks: [{ priority: "medium", dueOn: "2026-10-06" }] },
      at,
    );
    expect(overdue).toMatchObject({
      ruleId: "command.tasks.overdue",
      severity: "warning",
      title: "1 task overdue",
      detail: "The oldest was due on 6 Oct. None is high priority.",
    });
  });

  it("raises nothing when no threshold is crossed", () => {
    expect(
      evaluateSignals(
        { today, metrics: [], openTasks: [{ priority: "high", dueOn: "2026-10-08" }] },
        at,
      ),
    ).toEqual([]);
  });
});

describe("task input validation", () => {
  const base = { requestId: "7d8e0f6c-27a2-4d0e-9b1b-5c0f7a3e2d11", priority: "high" };

  it("trims titles and treats an empty due date as none", () => {
    expect(createTaskInput.parse({ ...base, title: "  Call supplier  ", dueOn: "" })).toEqual({
      ...base,
      title: "Call supplier",
      dueOn: null,
    });
  });

  it.each([
    [{ ...base, title: " " }, "title"],
    [{ ...base, title: "x".repeat(201) }, "title"],
    [{ ...base, title: "Task", priority: "urgent" }, "priority"],
    [{ ...base, title: "Task", dueOn: "07/10/2026" }, "dueOn"],
    [{ ...base, title: "Task", dueOn: "2026-02-30" }, "dueOn"],
    [{ ...base, title: "Task", requestId: "nope" }, "requestId"],
    [{ ...base, title: "Task", ventureId: base.requestId }, ""],
  ])("rejects %o", (input, field) => {
    const result = createTaskInput.safeParse(input);
    expect(result.success).toBe(false);
    if (field) expect(result.error!.issues.map((i) => i.path[0])).toContain(field);
  });

  it("accepts only explicit target states for completion", () => {
    const taskId = base.requestId;
    expect(taskStatusInput.safeParse({ taskId, status: "done" }).success).toBe(true);
    expect(taskStatusInput.safeParse({ taskId, status: "toggle" }).success).toBe(false);
  });
});
