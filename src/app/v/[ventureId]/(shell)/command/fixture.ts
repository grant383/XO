/**
 * Deterministic local fixture for the Command Centre screen (Figma 8:651). Presentation
 * only: no venture data is read or derived here. Live sources replace this module as the
 * Operate modules ship; the page labels everything it renders from here as sample data.
 */

export type Tone = "up" | "down" | "flat";
export type DotTone = "success" | "warning" | "danger" | "info" | "neutral";
export type Priority = "high" | "medium" | "low";

export type FixtureMetric = { label: string; value: string; change: string; tone: Tone };
export type FixtureChange = { when: string; text: string; tone: DotTone };
export type FixtureInsight = { title: string; body: string; meta: string; tone: DotTone };
export type FixtureTask = { title: string; priority: Priority; due: string };

export const COMMAND_FIXTURE = {
  date: "Thursday 4 Sep 2026",
  metrics: [
    { label: "Revenue MTD", value: "£38,420", change: "▲ +12%", tone: "up" },
    { label: "Jobs Completed", value: "187", change: "▲ +8%", tone: "up" },
    { label: "Pipeline Value", value: "£142,300", change: "▼ -3%", tone: "down" },
    { label: "Avg Job Value", value: "£205", change: "▲ +6%", tone: "up" },
    { label: "Customer Sat", value: "4.7/5.0", change: "▲ 0.0", tone: "up" },
    { label: "Cash Position", value: "£86,200", change: "• 0%", tone: "flat" },
  ] satisfies FixtureMetric[],
  changes: [
    { when: "2h ago", text: "Pipeline dropped below monthly target threshold", tone: "warning" },
    {
      when: "4h ago",
      text: "3 new jobs completed, revenue ahead of daily target",
      tone: "success",
    },
    { when: "6h ago", text: "Customer complaint flagged on Job #4821", tone: "danger" },
    { when: "8h ago", text: "New lead batch: 12 leads from Google Ads campaign", tone: "info" },
    { when: "Yesterday", text: "Monthly payroll processed: £28,400", tone: "neutral" },
  ] satisfies FixtureChange[],
  insights: [
    {
      title: "Pipeline Decline",
      body: "Lead conversion dropped from 35% to 28% this week. Google Ads CTR down 15%. Recommend increasing ad spend or testing new creative.",
      meta: "Sample analysis · 2h ago",
      tone: "warning",
    },
    {
      title: "Revenue Outperformance",
      body: "Avg transaction value up £12 from last month due to premium service upsell. 3 high-value emergency calls this week.",
      meta: "Sample analysis · 4h ago",
      tone: "success",
    },
  ] satisfies FixtureInsight[],
  tasks: [
    { title: "Review & approve revised Google Ads creative", priority: "high", due: "Today" },
    {
      title: "Call back Mrs. Patterson re: complaint on Job #4821",
      priority: "high",
      due: "Today",
    },
    { title: "Approve hire for 5th field engineer", priority: "medium", due: "This week" },
    { title: "Review Q3 financial forecast", priority: "medium", due: "Friday" },
    { title: "Schedule team standup for next sprint", priority: "low", due: "Next week" },
  ] satisfies FixtureTask[],
};
