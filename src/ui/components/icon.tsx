import Image from "next/image";

/**
 * Icons are the static SVG assets exported from Figma (Controls v2, login) and
 * served from `public/ui/icons`. Sizes are the assets' own root dimensions.
 */
export const ICONS = {
  "arrow-left": 14,
  "arrow-right": 14,
  check: 12,
  "check-success": 16,
  "chevron-down": 16,
  "circle-alert": 17,
  "circle-check": 18,
  "circle-x": 18,
  "clock-3": 15,
  eye: 16,
  info: 18,
  "loader-circle": 16,
  mail: 15,
  "mail-check": 28,
  plus: 18,
  search: 16,
  "shield-check": 14,
  "status-danger": 5,
  "status-requirement": 6,
  "status-success": 5,
  "status-warning": 5,
  "triangle-alert": 18,
  x: 14,
} as const;

export type IconName = keyof typeof ICONS;

type Props = { name: IconName; className?: string };

/** Decorative icon. Meaning must always be carried by adjacent text. */
export function Icon({ name, className }: Props) {
  const size = ICONS[name];
  return (
    <Image
      src={`/ui/icons/${name}.svg`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      className={className}
      unoptimized
    />
  );
}
