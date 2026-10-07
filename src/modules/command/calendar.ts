/**
 * Calendar helpers for Command Centre. Dates are rendered in the venture's timezone
 * (`ventures.timezone`), never the server's or the browser's, so every member sees the
 * same "today". Pure functions: `now` is always passed in.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86_400_000;

function parts(at: Date, timeZone: string) {
  const map = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: map.weekday as string,
    time: `${map.hour}:${map.minute}`,
  };
}

/** The calendar date (YYYY-MM-DD) at `at` in `timeZone`. */
export function localDate(at: Date, timeZone: string): string {
  const p = parts(at, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** "Thursday 4 Sep 2026" (Figma top bar). */
export function longDate(at: Date, timeZone: string): string {
  const p = parts(at, timeZone);
  return `${p.weekday} ${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

/** "14:02" in the venture timezone. */
export function clockTime(at: Date, timeZone: string): string {
  return parts(at, timeZone).time;
}

const toUtc = (isoDate: string) => Date.parse(`${isoDate}T00:00:00Z`);

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** "3 Oct", or "3 Oct 2027" outside the reference year. */
export function shortDate(isoDate: string, referenceDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const sameYear = referenceDate.startsWith(`${y}-`);
  return `${d} ${MONTHS[m - 1]}${sameYear ? "" : ` ${y}`}`;
}

export type DueLabel = { label: string; overdue: boolean };

/**
 * Figma "What to do" due column ("Today", "Friday", ...). Past dates say so in words, not
 * only colour (spec §20: no colour-only status).
 */
export function dueLabel(dueOn: string | null, today: string): DueLabel {
  if (!dueOn) return { label: "No date", overdue: false };
  const diff = daysBetween(today, dueOn);
  if (diff < 0) return { label: `Overdue · ${shortDate(dueOn, today)}`, overdue: true };
  if (diff === 0) return { label: "Today", overdue: false };
  if (diff === 1) return { label: "Tomorrow", overdue: false };
  if (diff < 7) {
    const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(
      toUtc(dueOn),
    );
    return { label: weekday, overdue: false };
  }
  return { label: shortDate(dueOn, today), overdue: false };
}

/** Figma "What changed" time column: "Just now", "2h ago", "Yesterday", "3 Oct". */
export function relativeTime(at: Date, now: Date, timeZone: string): string {
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const today = localDate(now, timeZone);
  const day = localDate(at, timeZone);
  if (day === today) return `${Math.floor(minutes / 60)}h ago`;
  if (daysBetween(day, today) === 1) return "Yesterday";
  return shortDate(day, today);
}
