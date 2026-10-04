import { encode } from "uqr";
import styles from "./profile-security.module.css";

/**
 * QR code for the otpauth:// enrolment URI, drawn as one SVG path (no image request, no
 * third-party service: the secret never leaves the page).
 */
export function QrCode({ value, label }: { value: string; label: string }) {
  const { data, size } = encode(value, { ecc: "M", border: 2 });
  let d = "";
  data.forEach((row, y) =>
    row.forEach((on, x) => {
      if (on) d += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return (
    <svg
      className={styles.qr}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <path d={d} fill="currentColor" />
    </svg>
  );
}
