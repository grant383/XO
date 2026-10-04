/**
 * Human label for a lifetime in seconds, e.g. 1800 → "30 minutes", 86400 → "24 hours",
 * 604800 → "7 days". Whole days are used from two days upwards.
 */
export function durationLabel(seconds: number): string {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (seconds >= 2 * 86400 && seconds % 86400 === 0) return plural(seconds / 86400, "day");
  if (seconds % 3600 === 0) return plural(seconds / 3600, "hour");
  return plural(Math.round(seconds / 60), "minute");
}
