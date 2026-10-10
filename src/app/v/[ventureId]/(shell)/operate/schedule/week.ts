/**
 * Working-week arithmetic on ISO dates (`YYYY-MM-DD`). Everything runs in UTC so the
 * labels never drift with the viewer's time zone, and months use a fixed table because
 * `Intl` en-GB renders September as "Sept".
 */
const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

const toTime = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
};
const toIso = (time: number) => new Date(time).toISOString().slice(0, 10);

export const addDays = (iso: string, days: number) => toIso(toTime(iso) + days * DAY_MS);
export const addWeeks = (iso: string, weeks: number) => addDays(iso, weeks * 7);

/** `2026-08-31` → `31 Aug`. */
export function formatDayMonth(iso: string) {
  const date = new Date(toTime(iso));
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** `2026-08-31` → `Week of 31 Aug 2026`. */
export function formatWeek(weekStart: string) {
  return `Week of ${formatDayMonth(weekStart)} ${new Date(toTime(weekStart)).getUTCFullYear()}`;
}

/** Monday to Friday of the week starting on `weekStart` (a Monday). */
export function workingDays(weekStart: string) {
  return WEEKDAYS.map((weekday, index) => {
    const iso = addDays(weekStart, index);
    return { iso, weekday, label: formatDayMonth(iso) };
  });
}

export const isMonday = (iso: string) => new Date(toTime(iso)).getUTCDay() === 1;
