import { forwardRef } from "react";
import styles from "./error-summary.module.css";
import { Icon } from "./icon";

type Props = {
  title: string;
  detail?: string;
  /** Field errors, keyed by input id, rendered as links that move focus to the field. */
  fieldErrors?: Record<string, string>;
  id?: string;
};

/**
 * Form error summary (Figma "Authentication error", 31:3580). Announced with role="alert"
 * and focusable so the form can move focus to it after a failed submit.
 */
export const ErrorSummary = forwardRef<HTMLDivElement, Props>(function ErrorSummary(
  { title, detail, fieldErrors, id },
  ref,
) {
  const entries = Object.entries(fieldErrors ?? {});
  return (
    <div ref={ref} id={id} role="alert" tabIndex={-1} className={styles.summary}>
      <Icon name="circle-alert" className={styles.icon} />
      <div className={styles.copy}>
        <p className={styles.title}>{title}</p>
        {detail ? <p className={styles.detail}>{detail}</p> : null}
        {entries.length > 0 ? (
          <ul className={`${styles.detail} ${styles.list}`}>
            {entries.map(([field, message]) => (
              <li key={field}>
                <a href={`#${field}`}>{message}</a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
});
