"use client";

import { useActionState, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import type { CompanyLookupResult } from "@/modules/ventures";
import { Alert, Button, ButtonLink, ErrorSummary, Icon, SelectField, TextField } from "@/ui";
import { idleState, type OnboardingFormState } from "./form-state";
import styles from "./onboarding.module.css";
import { SetupCard } from "./parts";

type Action = (prev: OnboardingFormState, data: FormData) => Promise<OnboardingFormState>;
type Option = { value: string; label: string };

/** Focusable error summary that receives focus after a failed submit (WCAG 3.3.1). */
function FormErrors({ state, title }: { state: OnboardingFormState; title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status === "error") ref.current?.focus();
  }, [state]);
  if (state.status !== "error") return null;
  const fieldErrors = state.fieldErrors ?? {};
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;
  return (
    <ErrorSummary
      ref={ref}
      title={title}
      detail={hasFieldErrors ? undefined : state.message}
      fieldErrors={hasFieldErrors ? fieldErrors : undefined}
    />
  );
}

const fieldError = (state: OnboardingFormState, name: string) =>
  state.status === "error" ? state.fieldErrors?.[name] : undefined;

/** Venture creation (name only). A per-render request id makes double submits idempotent. */
export function CreateVentureForm({ action, requestId }: { action: Action; requestId: string }) {
  const [state, formAction, pending] = useActionState(action, idleState);
  return (
    <form action={formAction} className={styles.form}>
      <FormErrors state={state} title="We couldn’t start setup" />
      <input type="hidden" name="requestId" value={requestId} />
      <TextField
        name="name"
        label="Business name"
        required
        maxLength={200}
        autoComplete="organization"
        defaultValue={state.status === "error" ? state.values?.name : undefined}
        error={fieldError(state, "name")}
      />
      <div className={styles.actions}>
        <ButtonLink href="/" variant="secondary">
          Cancel
        </ButtonLink>
        <Button type="submit" loading={pending} loadingLabel="Creating…">
          <Icon name="arrow-right-button" />
          Start setup
        </Button>
      </div>
    </form>
  );
}

export type BusinessDefaults = {
  name: string;
  legalName: string;
  companyNumber: string;
  sector: string;
  reportingCurrency: string;
  timezone: string;
  fiscalYearStartMonth: string;
};

type LookupResult = CompanyLookupResult | { status: "error"; message: string };

function LookupOutcome({ result, onUse }: { result: LookupResult; onUse: (name: string) => void }) {
  switch (result.status) {
    case "found":
      return (
        <Alert tone="success" title={`Companies House: ${result.company.name}`}>
          Status: {result.company.status}.{" "}
          <button
            type="button"
            className={styles.editLink}
            onClick={() => onUse(result.company.name)}
          >
            Use as legal name
          </button>
        </Alert>
      );
    case "not_found":
      return <Alert tone="warning" title="No company found with that number." />;
    case "invalid_number":
      return (
        <Alert tone="warning" title="Check the company number">
          Enter 8 characters, for example 01234567 or SC123456.
        </Alert>
      );
    case "unavailable":
      return (
        <Alert tone="info" title="Companies House is unavailable right now">
          You can continue and enter the details manually.
        </Alert>
      );
    default:
      return <Alert tone="error" title={result.message} />;
  }
}

export function BusinessForm({
  action,
  lookup,
  defaults,
  sectors,
  currencies,
  timezones,
  months,
}: {
  action: Action;
  lookup: (companyNumber: string) => Promise<LookupResult>;
  defaults: BusinessDefaults;
  sectors: Option[];
  currencies: Option[];
  timezones: Option[];
  months: Option[];
}) {
  const [state, formAction, pending] = useActionState(action, idleState);
  const values =
    state.status === "error" && state.values ? { ...defaults, ...state.values } : defaults;
  const [legalName, setLegalName] = useState(values.legalName);
  const [companyNumber, setCompanyNumber] = useState(values.companyNumber);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [looking, startLookup] = useTransition();

  return (
    // Keyed by submission so uncontrolled fields re-populate from returned values.
    <form
      action={formAction}
      className={styles.form}
      key={state.status === "error" ? JSON.stringify(state.values) : "initial"}
    >
      <FormErrors state={state} title="Check your business details" />
      <div className={styles.grid}>
        <TextField
          name="name"
          label="Business name"
          required
          maxLength={200}
          autoComplete="organization"
          defaultValue={values.name}
          error={fieldError(state, "name")}
        />
        <SelectField
          name="sector"
          label="Sector"
          required
          placeholder="Choose a sector"
          options={sectors}
          defaultValue={values.sector}
          error={fieldError(state, "sector")}
        />
        <div className={styles.lookupRow}>
          <TextField
            name="companyNumber"
            label="Companies House number (optional)"
            maxLength={10}
            value={companyNumber}
            onChange={(e) => setCompanyNumber(e.target.value)}
            error={fieldError(state, "companyNumber")}
          />
          <Button
            variant="secondary"
            disabled={companyNumber.trim() === ""}
            loading={looking}
            loadingLabel="Looking up…"
            onClick={() => startLookup(async () => setResult(await lookup(companyNumber)))}
          >
            Look up
          </Button>
        </div>
        <TextField
          name="legalName"
          label="Legal name (optional)"
          maxLength={200}
          value={legalName}
          onChange={(e) => setLegalName(e.target.value)}
          error={fieldError(state, "legalName")}
        />
        <SelectField
          name="reportingCurrency"
          label="Reporting currency"
          required
          options={currencies}
          defaultValue={values.reportingCurrency}
          hint="Used across forecasts and reporting."
          error={fieldError(state, "reportingCurrency")}
        />
        <SelectField
          name="timezone"
          label="Timezone"
          required
          options={timezones}
          defaultValue={values.timezone}
          error={fieldError(state, "timezone")}
        />
        <SelectField
          name="fiscalYearStartMonth"
          label="Financial year starts"
          required
          placeholder="Choose a month"
          options={months}
          defaultValue={values.fiscalYearStartMonth}
          error={fieldError(state, "fiscalYearStartMonth")}
        />
      </div>
      <div aria-live="polite">
        {result ? <LookupOutcome result={result} onUse={setLegalName} /> : null}
      </div>
      <div className={styles.actions}>
        <ButtonLink href="/" variant="secondary">
          Exit setup
        </ButtonLink>
        <Button type="submit" loading={pending} loadingLabel="Saving…">
          <Icon name="arrow-right-button" />
          Continue
        </Button>
      </div>
    </form>
  );
}

/** A single-submit step action with a Back link (data connections). */
export function StepForm({
  action,
  label,
  pendingLabel,
  back,
}: {
  action: (prev: OnboardingFormState) => Promise<OnboardingFormState>;
  label: string;
  pendingLabel: string;
  back: { href: string; label: string };
}) {
  const [state, formAction, pending] = useActionState(action, idleState);
  return (
    <form action={formAction} className={styles.form}>
      <FormErrors state={state} title="We couldn’t continue" />
      <div className={styles.actions}>
        <ButtonLink href={back.href} variant="secondary">
          <Icon name="arrow-left-button" />
          {back.label}
        </ButtonLink>
        <Button type="submit" loading={pending} loadingLabel={pendingLabel}>
          <Icon name="arrow-right-button" />
          {label}
        </Button>
      </div>
    </form>
  );
}

/**
 * Review confirmation. While the completion action runs the card shows the Figma
 * "Creating workspace" state (54:27638); on success, "Onboarding complete" (54:27717).
 * Both are UX states: activation happens only in `app.complete_venture_onboarding()`.
 */
export function ConfirmOnboarding({
  action,
  backHref,
  review,
  creating,
  complete,
}: {
  action: (prev: OnboardingFormState) => Promise<OnboardingFormState>;
  backHref: string;
  review: ReactNode;
  creating: ReactNode;
  complete: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, idleState);
  if (state.status === "complete") return complete;
  return (
    <SetupCard>
      <form action={formAction} className={styles.form}>
        {pending ? creating : review}
        <FormErrors state={state} title="We couldn’t create your workspace" />
        {pending ? null : (
          <div className={styles.actions}>
            <ButtonLink href={backHref} variant="secondary">
              <Icon name="arrow-left-button" />
              Back
            </ButtonLink>
            <Button type="submit">
              Create my workspace
              <Icon name="arrow-right-button" />
            </Button>
          </div>
        )}
      </form>
    </SetupCard>
  );
}
