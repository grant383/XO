import Image from "next/image";

/**
 * Icons are the static SVG assets exported from Figma (Controls v2, auth, onboarding and
 * app shell frames), served from `public/ui/icons`. Sizes are the assets' own root
 * dimensions. Figma bakes stroke colours into each asset, so a role-specific variant
 * (`-button`, `-sm`, `-md`) is a separate file rather than a recoloured one.
 */
export const ICONS = {
  "arrow-left": 14,
  "arrow-left-button": 15,
  "arrow-right": 14,
  "arrow-right-button": 15,
  "badge-check": 26.88,
  "building-2": 18,
  "building-2-sm": 16,
  check: 12,
  "check-success": 16,
  "chevron-down": 16,
  "chevron-down-account": 16,
  "chevrons-up-down": 16,
  "circle-alert": 17,
  "circle-check": 18,
  "circle-x": 18,
  "clock-3": 15,
  "clock-3-lg": 26.88,
  database: 16,
  eye: 16,
  inbox: 22,
  info: 18,
  "layout-dashboard": 15,
  "layout-grid": 14,
  "loader-circle": 16,
  "loader-circle-lg": 22,
  "key-round": 21.84,
  "key-round-sm": 16,
  laptop: 18,
  "log-out": 15,
  "lock-keyhole": 11,
  mail: 15,
  "map-pinned": 26,
  "mail-check": 28,
  menu: 18,
  plus: 18,
  "refresh-cw": 15,
  search: 16,
  send: 15,
  "send-horizontal": 26.88,
  "server-cog": 26,
  "shield-check": 14,
  "shield-check-lg": 26.88,
  "shield-check-md": 16,
  "shield-check-thin": 16,
  "shield-x": 28,
  smartphone: 18,
  "status-danger": 5,
  "status-info": 5,
  "status-requirement": 6,
  "status-success": 5,
  "status-warning": 5,
  "triangle-alert": 18,
  "user-plus": 26.88,
  "user-plus-button": 15,
  users: 20,
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
