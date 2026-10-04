"use client";

import { useId, useState } from "react";
import { cx } from "@/ui";
import styles from "./mfa.module.css";

type Props = {
  name: string;
  label: string;
  length: number;
  invalid?: boolean;
  describedBy?: string;
};

/**
 * Figma "Authenticator digits": one real input (so paste, autofill of one-time codes and
 * screen readers work as for any field) drawn as separate digit cells. The cells are
 * presentation only and hidden from assistive technology.
 */
export function CodeInput({ name, label, length, invalid, describedBy }: Props) {
  const id = useId();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  return (
    <div className={styles.codeField}>
      <label htmlFor={id} className={styles.visuallyHidden}>
        {label}
      </label>
      <div className={styles.codeControl}>
        <div className={styles.cells} aria-hidden="true">
          {Array.from({ length }, (_, i) => {
            const char = value[i];
            const active = focused && i === Math.min(value.length, length - 1);
            return (
              <span
                key={i}
                className={cx(
                  styles.cell,
                  !char && styles.cellEmpty,
                  active && styles.cellActive,
                  invalid && !char && styles.cellInvalid,
                )}
              >
                {char ?? "—"}
              </span>
            );
          })}
        </div>
        <input
          id={id}
          name={name}
          className={styles.codeInput}
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, length))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern={`\\d{${length}}`}
          maxLength={length}
          required
          autoFocus
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        />
      </div>
    </div>
  );
}
