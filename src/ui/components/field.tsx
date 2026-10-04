import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cx } from "../cx";
import styles from "./field.module.css";
import { Icon } from "./icon";
import { PasswordInput } from "./password-input";

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "name" | "children"> & {
  name: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  /** Defaults to `name`. Must be unique on the page. */
  id?: string;
};

export function describedBy(id: string, hint: unknown, error: unknown): string | undefined {
  return (
    [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined
  );
}

/**
 * Figma Component/Form/Text Field: label above a 46px control, hint and inline
 * error below. Errors are programmatically linked via aria-describedby.
 */
export function TextField({
  name,
  label,
  hint,
  error,
  id = name,
  className,
  type = "text",
  ...rest
}: FieldProps) {
  const inputProps = {
    ...rest,
    id,
    name,
    className: styles.input,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy(id, hint, error),
  };
  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {type === "password" ? (
        <PasswordInput {...inputProps} invalid={Boolean(error)} />
      ) : (
        <div className={styles.control} data-invalid={error ? "true" : undefined}>
          <input {...inputProps} type={type} />
        </div>
      )}
      {hint ? (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "name" | "children"> & {
  name: string;
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  /** Optional empty first option ("Choose a sector"). */
  placeholder?: string;
  hint?: ReactNode;
  error?: string;
  id?: string;
};

/**
 * Figma Component/Form/Select (Controls v2): the Text Field frame with a trailing
 * chevron. A native <select> keeps platform keyboard and screen-reader behaviour.
 */
export function SelectField({
  name,
  label,
  options,
  placeholder,
  hint,
  error,
  id = name,
  className,
  ...rest
}: SelectProps) {
  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={styles.control} data-invalid={error ? "true" : undefined}>
        <select
          {...rest}
          id={id}
          name={name}
          className={cx(styles.input, styles.select)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
        >
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" className={styles.chevron} />
      </div>
      {hint ? (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children"> & {
  label: ReactNode;
};

/** Figma Component/Form/Checkbox. */
export function Checkbox({ label, className, ...rest }: CheckboxProps) {
  return (
    <label className={cx(styles.checkboxRow, className)}>
      <input {...rest} type="checkbox" className={styles.checkbox} />
      {label}
    </label>
  );
}
