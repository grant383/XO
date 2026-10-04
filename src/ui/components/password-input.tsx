"use client";

import { useState, type InputHTMLAttributes } from "react";
import styles from "./field.module.css";
import { Icon } from "./icon";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { invalid: boolean };

/** Password control with the Figma reveal (eye) affordance. */
export function PasswordInput({ invalid, ...inputProps }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={styles.control} data-invalid={invalid ? "true" : undefined}>
      <input {...inputProps} type={visible ? "text" : "password"} />
      <button
        type="button"
        className={styles.reveal}
        aria-label="Show password"
        aria-pressed={visible}
        aria-controls={inputProps.id}
        onClick={() => setVisible((v) => !v)}
      >
        <Icon name="eye" />
      </button>
    </div>
  );
}
