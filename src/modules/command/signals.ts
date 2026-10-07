import { shortDate } from "./calendar";
import type { CommandMetric } from "./metrics";

/**
 * Command Centre "Why" (Figma 8:651). Release 1 explains health with deterministic,
 * versioned rules, not AI (spec §3, §13.14): every signal carries its rule id and version,
 * the triggering values, the threshold, a severity and a recommended action.
 *
 * Signals are evaluated on read and not persisted. The persisted recommendation workflow
 * (status, reviewer decision, dismissal) is P2 Intelligence (spec §11, §19).
 */

export type SignalSeverity = "danger" | "warning" | "info";

export type CommandSignal = {
  ruleId: string;
  ruleVersion: number;
  severity: SignalSeverity;
  title: string;
  detail: string;
  action: string;
  threshold: string;
  evidence: { label: string; value: string }[];
  evaluatedAt: Date;
};

export type SignalTask = {
  priority: "high" | "medium" | "low";
  dueOn: string | null;
};

export type SignalInput = {
  /** YYYY-MM-DD in the venture timezone. */
  today: string;
  openTasks: SignalTask[];
  metrics: CommandMetric[];
};

type Rule = {
  id: string;
  version: number;
  evaluate(
    input: SignalInput,
  ): Omit<CommandSignal, "ruleId" | "ruleVersion" | "evaluatedAt"> | null;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const RULES: readonly Rule[] = [
  {
    id: "command.tasks.overdue",
    version: 1,
    evaluate({ today, openTasks }) {
      const overdue = openTasks.filter((t) => t.dueOn !== null && t.dueOn < today);
      if (overdue.length === 0) return null;
      const high = overdue.filter((t) => t.priority === "high").length;
      const oldest = overdue.map((t) => t.dueOn!).sort()[0]!;
      return {
        severity: high > 0 ? "danger" : "warning",
        title: `${plural(overdue.length, "task")} overdue`,
        detail: `The oldest was due on ${shortDate(oldest, today)}. ${
          high > 0
            ? `${high} of them ${high === 1 ? "is" : "are"} high priority.`
            : "None is high priority."
        }`,
        action: "Complete them, or confirm with the team that they are still needed.",
        threshold: "1 or more open tasks past their due date",
        evidence: [
          { label: "Overdue open tasks", value: String(overdue.length) },
          { label: "High priority", value: String(high) },
          { label: "Oldest due date", value: oldest },
        ],
      };
    },
  },
  {
    id: "command.tasks.high_priority_due_today",
    version: 1,
    evaluate({ today, openTasks }) {
      const due = openTasks.filter((t) => t.priority === "high" && t.dueOn === today);
      if (due.length === 0) return null;
      return {
        severity: "warning",
        title: `${plural(due.length, "high-priority task")} due today`,
        detail:
          "These are still open and fall due before the end of today in the venture’s timezone.",
        action: "Prioritise them before other open work.",
        threshold: "1 or more open high-priority tasks due today",
        evidence: [
          { label: "High-priority tasks due today", value: String(due.length) },
          { label: "Venture date", value: today },
        ],
      };
    },
  },
  {
    id: "command.metrics.awaiting_sources",
    version: 1,
    evaluate({ metrics }) {
      const awaiting = metrics.filter((m) => m.status === "awaiting_source");
      if (awaiting.length === 0) return null;
      return {
        severity: "info",
        title: "Business metrics are not connected yet",
        detail: `${awaiting.length} of ${metrics.length} Command metrics have no connected source, so revenue, pipeline and cash rules cannot run.`,
        action:
          "Figures and their rules appear here as Finance, Operations and Growth records become available.",
        threshold: "1 or more Command metrics without a connected source",
        evidence: awaiting.map((m) => ({ label: m.label, value: m.source })),
      };
    },
  },
];

const ORDER: Record<SignalSeverity, number> = { danger: 0, warning: 1, info: 2 };

/** Evaluates every rule; most severe first, then in rule order. */
export function evaluateSignals(input: SignalInput, evaluatedAt: Date): CommandSignal[] {
  return RULES.flatMap((rule) => {
    const result = rule.evaluate(input);
    return result ? [{ ...result, ruleId: rule.id, ruleVersion: rule.version, evaluatedAt }] : [];
  }).sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}
