import Link from "next/link";
import { cx } from "../cx";
import styles from "./brand.module.css";

/** DirectorXO logo mark and wordmark (Figma "Brand": white tile, obsidian centre). */
export function Brand({ compact, href = "/" }: { compact?: boolean; href?: "/" | null }) {
  const content = (
    <>
      <span className={styles.mark} aria-hidden="true" />
      DirectorXO
    </>
  );
  const className = cx(styles.brand, compact && styles.compact);
  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <span className={className}>{content}</span>
  );
}
