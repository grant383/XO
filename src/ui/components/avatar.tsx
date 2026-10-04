import { cx } from "../cx";
import styles from "./avatar.module.css";

/** Up to two initials from a display name ("Sarah Mitchell" → "SM"). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1 ? [words[0]![0], words.at(-1)![0]] : [...(words[0] ?? "")].slice(0, 2);
  return letters.join("").toUpperCase() || "?";
}

/**
 * Figma initials avatar (round, people) and venture mark (square, ventures). Purely
 * decorative: the adjacent name always carries the meaning, so it is hidden from
 * assistive technology. DirectorXO stores no profile photos, so initials are used.
 */
export function Avatar({
  name,
  size = 30,
  shape = "round",
  className,
}: {
  name: string;
  size?: 24 | 30 | 32 | 40;
  shape?: "round" | "square";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(styles.avatar, styles[shape], className)}
      style={{ width: size, height: size }}
    >
      {initialsOf(name)}
    </span>
  );
}
