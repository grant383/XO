"use client";

import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Alert, Button, ErrorSummary, Icon, TextField } from "@/ui";
import type { MfaEnrolment } from "@/modules/identity";
import {
  changePasswordAction,
  confirmMfaAction,
  disableMfaAction,
  reauthenticateAction,
  regenerateCodesAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
  startMfaAction,
  updateNameAction,
} from "./actions";
import { idle, type SettingsState } from "./form-state";
import { QrCode } from "./qr-code";
import styles from "./profile-security.module.css";

type ErrorState = Extract<SettingsState<unknown>, { status: "error" }>;

/** Focused error summary; "sign in again" when the change needs a recent sign-in. */
function FormError({ state, title }: { state: SettingsState<unknown>; title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status === "error") ref.current?.focus();
  }, [state]);
  if (state.status !== "error") return null;
  const error = state as ErrorState;
  const fieldErrors = error.fieldErrors ?? {};
  const hasFields = Object.keys(fieldErrors).length > 0;
  return (
    <>
      <ErrorSummary
        ref={ref}
        title={title}
        detail={hasFields ? undefined : error.message}
        fieldErrors={hasFields ? fieldErrors : undefined}
      />
      {error.code === "REAUTH_REQUIRED" ? (
        <form action={reauthenticateAction}>
          <Button type="submit" variant="secondary">
            Sign in again
          </Button>
        </form>
      ) : null}
    </>
  );
}

const fieldError = (state: SettingsState<unknown>, name: string) =>
  state.status === "error" ? state.fieldErrors?.[name] : undefined;

// ---------------------------------------------------------------------------
// Personal details
// ---------------------------------------------------------------------------

export function PersonalDetailsForm({
  name,
  email,
  avatar,
}: {
  name: string;
  email: string;
  avatar: ReactNode;
}) {
  const [state, action, pending] = useActionState(updateNameAction, idle);
  return (
    <form action={action} className={styles.card} aria-labelledby="personal-details">
      <div className={styles.cardHeading}>
        <div className={styles.headingCopy}>
          <h2 id="personal-details">Personal details</h2>
          <p>Used for account communications and workspace attribution.</p>
        </div>
        <Button type="submit" loading={pending} loadingLabel="Saving…">
          Save changes
        </Button>
      </div>
      <hr className={styles.divider} />
      <FormError state={state} title="We couldn’t save your details" />
      {state.status === "success" ? <Alert tone="success" title={state.message} /> : null}
      <div className={styles.profile}>
        {avatar}
        <div className={styles.profileFields}>
          <TextField
            name="name"
            label="Full name"
            autoComplete="name"
            defaultValue={name}
            required
            maxLength={120}
            error={fieldError(state, "name")}
          />
          <TextField
            name="email"
            id="work-email"
            label="Work email"
            type="email"
            value={email}
            readOnly
            hint="Your sign-in address. It can’t be changed here."
          />
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Security rows and disclosures
// ---------------------------------------------------------------------------

export function SecurityRow({
  icon,
  title,
  detail,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  detail: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={styles.securityRow}>
      <div className={styles.rowMain}>
        {icon}
        <div className={styles.rowCopy}>
          <h3>{title}</h3>
          <p>{detail}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/** Disclosure button + panel pair (aria-expanded / aria-controls). */
function useDisclosure() {
  const [open, setOpen] = useState(false);
  const id = useId();
  return {
    open,
    setOpen,
    button: (label: string, openLabel = "Cancel") => (
      <Button
        variant="secondary"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? openLabel : label}
      </Button>
    ),
    id,
  };
}

export function PasswordRow({ detail, requirements }: { detail: string; requirements: ReactNode }) {
  const d = useDisclosure();
  const [state, action, pending] = useActionState(changePasswordAction, idle);
  const [round, setRound] = useState(0);
  return (
    <SecurityRow
      icon={
        <span className={styles.rowIcon} data-tone="info">
          {ICONS.key}
        </span>
      }
      title="Password"
      detail={detail}
      action={d.button("Change password")}
    >
      {state.status === "success" && !d.open ? (
        <Alert tone="success" title={state.message} />
      ) : null}
      <div id={d.id} hidden={!d.open} className={styles.panel}>
        <form key={round} action={action} className={styles.panelForm}>
          <FormError state={state} title="We couldn’t change your password" />
          <TextField
            name="currentPassword"
            label="Current password"
            type="password"
            autoComplete="current-password"
            required
            error={fieldError(state, "currentPassword")}
          />
          <TextField
            name="newPassword"
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            error={fieldError(state, "newPassword") ?? fieldError(state, "password")}
          />
          <TextField
            name="confirmPassword"
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            required
            error={fieldError(state, "confirmPassword")}
          />
          {requirements}
          <div className={styles.panelActions}>
            <Button type="submit" loading={pending} loadingLabel="Saving…">
              Save new password
            </Button>
          </div>
        </form>
      </div>
      <SuccessCloser
        state={state}
        onSuccess={() => {
          d.setOpen(false);
          setRound((r) => r + 1);
        }}
      />
    </SecurityRow>
  );
}

/** Runs `onSuccess` once for each new successful result. */
function SuccessCloser({
  state,
  onSuccess,
}: {
  state: SettingsState<unknown>;
  onSuccess: () => void;
}) {
  const seen = useRef<SettingsState<unknown> | null>(null);
  useEffect(() => {
    if (state.status === "success" && seen.current !== state) {
      seen.current = state;
      onSuccess();
    }
  });
  return null;
}

// ---------------------------------------------------------------------------
// Multi-factor authentication
// ---------------------------------------------------------------------------

function PasswordConfirmForm({
  action,
  pending,
  state,
  submitLabel,
  errorTitle,
  danger,
  children,
}: {
  action: (data: FormData) => void;
  pending: boolean;
  state: SettingsState<unknown>;
  submitLabel: string;
  errorTitle: string;
  danger?: boolean;
  children?: ReactNode;
}) {
  return (
    <form action={action} className={styles.panelForm}>
      <FormError state={state} title={errorTitle} />
      {children}
      <TextField
        name="password"
        label="Confirm your password"
        type="password"
        autoComplete="current-password"
        required
        error={fieldError(state, "password")}
      />
      <div className={styles.panelActions}>
        <Button
          type="submit"
          variant={danger ? "danger" : "primary"}
          loading={pending}
          loadingLabel="Checking…"
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** Backup codes, shown once. Copy and download keep them out of any server log. */
export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone?: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");
  return (
    <div className={styles.codesPanel}>
      <Alert tone="warning" title="Save these backup codes now">
        Each code signs you in once if you lose your authenticator. They will not be shown again.
      </Alert>
      <ol className={styles.codes} aria-label="Backup codes">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <div className={styles.panelActions}>
        <Button
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy codes"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([`${text}\n`], { type: "text/plain" }));
            const a = Object.assign(document.createElement("a"), {
              href: url,
              download: "directorxo-backup-codes.txt",
            });
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Download
        </Button>
        {onDone ? <Button onClick={onDone}>I’ve saved my codes</Button> : null}
      </div>
      <p className={styles.srStatus} role="status">
        {copied ? "Backup codes copied to the clipboard." : ""}
      </p>
    </div>
  );
}

function groupKey(key: string) {
  return key.match(/.{1,4}/g)?.join(" ") ?? key;
}

function MfaSetup({ onFinished }: { onFinished: () => void }) {
  const [start, startAction, starting] = useActionState(startMfaAction, idle);
  const [confirm, confirmAction, confirming] = useActionState(confirmMfaAction, idle);
  const enrolment: MfaEnrolment | undefined = start.status === "success" ? start.data : undefined;

  if (confirm.status === "success" && enrolment) {
    return (
      <div className={styles.panelForm}>
        <Alert tone="success" title={confirm.message} />
        <RecoveryCodes codes={enrolment.recoveryCodes} onDone={onFinished} />
      </div>
    );
  }
  if (!enrolment) {
    return (
      <PasswordConfirmForm
        action={startAction}
        pending={starting}
        state={start}
        submitLabel="Continue"
        errorTitle="We couldn’t start set-up"
      >
        <p className={styles.panelLede}>
          You’ll need an authenticator app such as 1Password, Google Authenticator or Microsoft
          Authenticator. Confirm your password to begin.
        </p>
      </PasswordConfirmForm>
    );
  }
  return (
    <form action={confirmAction} className={styles.panelForm}>
      <FormError state={confirm} title="We couldn’t turn on two-step verification" />
      <ol className={styles.steps}>
        <li>
          <p>Scan this QR code with your authenticator app.</p>
          <QrCode value={enrolment.totpUri} label="QR code for your authenticator app" />
        </li>
        <li>
          <p>Or enter this key by hand:</p>
          <code className={styles.manualKey}>{groupKey(enrolment.manualKey)}</code>
        </li>
        <li>
          <TextField
            name="code"
            label="Enter the 6-digit code it shows"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            required
            error={fieldError(confirm, "code")}
          />
        </li>
      </ol>
      <div className={styles.panelActions}>
        <Button type="submit" loading={confirming} loadingLabel="Verifying…">
          Turn on two-step verification
        </Button>
      </div>
    </form>
  );
}

function MfaManage({ onDisabled }: { onDisabled: () => void }) {
  const [regen, regenAction, regenerating] = useActionState(regenerateCodesAction, idle);
  const [disable, disableAction, disabling] = useActionState(disableMfaAction, idle);
  const codes = regen.status === "success" ? regen.data?.recoveryCodes : undefined;
  return (
    <div className={styles.manageGrid}>
      <section className={styles.subPanel} aria-labelledby="mfa-codes">
        <h4 id="mfa-codes">Backup codes</h4>
        {codes ? (
          <RecoveryCodes codes={codes} />
        ) : (
          <PasswordConfirmForm
            action={regenAction}
            pending={regenerating}
            state={regen}
            submitLabel="Create new backup codes"
            errorTitle="We couldn’t create new codes"
          >
            <p className={styles.panelLede}>
              Creating new codes replaces all of your existing ones.
            </p>
          </PasswordConfirmForm>
        )}
      </section>
      <section className={styles.subPanel} aria-labelledby="mfa-off">
        <h4 id="mfa-off">Turn off two-step verification</h4>
        <PasswordConfirmForm
          action={disableAction}
          pending={disabling}
          state={disable}
          submitLabel="Turn off"
          errorTitle="We couldn’t turn off two-step verification"
          danger
        >
          <p className={styles.panelLede}>
            Your account will be protected by your password alone. This needs a sign-in within the
            last 15 minutes.
          </p>
        </PasswordConfirmForm>
        <SuccessCloser state={disable} onSuccess={onDisabled} />
      </section>
    </div>
  );
}

export function MfaRow({ enabled, detail }: { enabled: boolean; detail: string }) {
  const id = useId();
  // Fixed when the panel opens: the page re-renders with the new MFA state as soon as a
  // change succeeds, and the panel must stay put (e.g. to show new backup codes).
  const [panel, setPanel] = useState<"setup" | "manage" | null>(null);
  const [round, setRound] = useState(0);
  const close = () => {
    setPanel(null);
    setRound((r) => r + 1);
  };
  const open = panel !== null;
  return (
    <SecurityRow
      icon={
        <span className={styles.rowIcon} data-tone={enabled ? "success" : "info"}>
          {ICONS.shield}
        </span>
      }
      title="Multi-factor authentication"
      detail={detail}
      action={
        <Button
          variant="secondary"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => (open ? close() : setPanel(enabled ? "manage" : "setup"))}
        >
          {open ? (panel === "manage" ? "Close" : "Cancel") : enabled ? "Manage MFA" : "Set up MFA"}
        </Button>
      }
    >
      <div id={id} hidden={!open} className={styles.panel}>
        {panel === "manage" ? (
          <MfaManage
            key={round}
            onDisabled={() => {
              close();
            }}
          />
        ) : null}
        {panel === "setup" ? <MfaSetup key={round} onFinished={close} /> : null}
      </div>
    </SecurityRow>
  );
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function RevokeOthersButton({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState(revokeOtherSessionsAction, idle);
  return (
    <form action={action} className={styles.inlineForm}>
      <Button
        type="submit"
        variant="secondary"
        disabled={disabled}
        loading={pending}
        loadingLabel="Signing out…"
      >
        Sign out all other sessions
      </Button>
      {state.status === "error" ? (
        <p className={styles.inlineError} role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function RevokeSessionButton({ sessionId, device }: { sessionId: string; device: string }) {
  const [state, action, pending] = useActionState(revokeSessionAction, idle);
  return (
    <form action={action} className={styles.inlineForm}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <Button type="submit" variant="danger" loading={pending} loadingLabel="Signing out…">
        Sign out<span className="visually-hidden"> {device}</span>
      </Button>
      {state.status === "error" ? (
        <p className={styles.inlineError} role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

const ICONS = {
  key: <Icon name="key-round-sm" />,
  shield: <Icon name="shield-check-md" />,
};
