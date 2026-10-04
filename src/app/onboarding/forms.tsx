"use client";

import { useActionState, useState, useTransition } from "react";
import type { CompanyLookupResult } from "@/modules/ventures";
import { idleState, type OnboardingFormState } from "./form-state";

type Action = (prev: OnboardingFormState, data: FormData) => Promise<OnboardingFormState>;

function ErrorSummary({ state }: { state: OnboardingFormState }) {
  if (state.status !== "error") return null;
  return (
    <div role="alert">
      <p>{state.message}</p>
      {state.fieldErrors && Object.keys(state.fieldErrors).length > 0 ? (
        <ul>
          {Object.entries(state.fieldErrors).map(([field, message]) => (
            <li key={field}>
              <a href={`#${field}`}>{message}</a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function FieldError({ state, name }: { state: OnboardingFormState; name: string }) {
  const error = state.status === "error" ? state.fieldErrors?.[name] : undefined;
  return error ? (
    <small id={`${name}-error`} role="alert">
      {error}
    </small>
  ) : null;
}

const invalid = (state: OnboardingFormState, name: string) =>
  state.status === "error" && state.fieldErrors?.[name]
    ? { "aria-invalid": true as const, "aria-describedby": `${name}-error` }
    : {};

/** Venture creation (name only). A per-render request id makes double submits idempotent. */
export function CreateVentureForm({ action, requestId }: { action: Action; requestId: string }) {
  const [state, formAction, pending] = useActionState(action, idleState);
  return (
    <form action={formAction}>
      <ErrorSummary state={state} />
      <input type="hidden" name="requestId" value={requestId} />
      <p>
        <label htmlFor="name">Business name</label>
        <br />
        <input
          id="name"
          name="name"
          required
          maxLength={200}
          autoComplete="organization"
          defaultValue={state.status === "error" ? state.values?.name : undefined}
          {...invalid(state, "name")}
        />
        <FieldError state={state} name="name" />
      </p>
      <button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Creating…" : "Start setup"}
      </button>
    </form>
  );
}

type Option = { value: string; label: string };

export type BusinessDefaults = {
  name: string;
  legalName: string;
  companyNumber: string;
  sector: string;
  reportingCurrency: string;
  timezone: string;
  fiscalYearStartMonth: string;
};

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
  lookup: (
    companyNumber: string,
  ) => Promise<CompanyLookupResult | { status: "error"; message: string }>;
  defaults: BusinessDefaults;
  sectors: Option[];
  currencies: Option[];
  timezones: string[];
  months: Option[];
}) {
  const [state, formAction, pending] = useActionState(action, idleState);
  const values =
    state.status === "error" && state.values ? { ...defaults, ...state.values } : defaults;
  const [legalName, setLegalName] = useState(values.legalName);
  const [companyNumber, setCompanyNumber] = useState(values.companyNumber);
  const [result, setResult] = useState<Awaited<ReturnType<typeof lookup>> | null>(null);
  const [looking, startLookup] = useTransition();

  return (
    // Keyed by submission so uncontrolled fields re-populate from returned values.
    <form
      action={formAction}
      key={state.status === "error" ? JSON.stringify(state.values) : "initial"}
    >
      <ErrorSummary state={state} />

      <p>
        <label htmlFor="name">Business name</label>
        <br />
        <input
          id="name"
          name="name"
          required
          maxLength={200}
          defaultValue={values.name}
          {...invalid(state, "name")}
        />
        <FieldError state={state} name="name" />
      </p>

      <fieldset>
        <legend>Company registration (optional)</legend>
        <p>
          <label htmlFor="companyNumber">Companies House number</label>
          <br />
          <input
            id="companyNumber"
            name="companyNumber"
            maxLength={10}
            value={companyNumber}
            onChange={(e) => setCompanyNumber(e.target.value)}
            {...invalid(state, "companyNumber")}
          />{" "}
          <button
            type="button"
            disabled={looking || companyNumber.trim() === ""}
            onClick={() => startLookup(async () => setResult(await lookup(companyNumber)))}
          >
            {looking ? "Looking up…" : "Look up"}
          </button>
          <FieldError state={state} name="companyNumber" />
        </p>
        <div aria-live="polite">
          {result?.status === "found" ? (
            <p>
              Companies House: <strong>{result.company.name}</strong> ({result.company.status}).{" "}
              <button type="button" onClick={() => setLegalName(result.company.name)}>
                Use as legal name
              </button>
            </p>
          ) : result?.status === "not_found" ? (
            <p>No company found with that number.</p>
          ) : result?.status === "invalid_number" ? (
            <p>Enter 8 characters, for example 01234567 or SC123456.</p>
          ) : result?.status === "unavailable" ? (
            <p>
              Companies House is unavailable right now. You can continue and enter details manually.
            </p>
          ) : result?.status === "error" ? (
            <p>{result.message}</p>
          ) : null}
        </div>
        <p>
          <label htmlFor="legalName">Legal name</label>
          <br />
          <input
            id="legalName"
            name="legalName"
            maxLength={200}
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            {...invalid(state, "legalName")}
          />
          <FieldError state={state} name="legalName" />
        </p>
      </fieldset>

      <p>
        <label htmlFor="sector">Sector</label>
        <br />
        <select
          id="sector"
          name="sector"
          required
          defaultValue={values.sector}
          {...invalid(state, "sector")}
        >
          <option value="">Choose a sector</option>
          {sectors.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <FieldError state={state} name="sector" />
      </p>

      <p>
        <label htmlFor="reportingCurrency">Reporting currency</label>
        <br />
        <select
          id="reportingCurrency"
          name="reportingCurrency"
          required
          defaultValue={values.reportingCurrency}
          {...invalid(state, "reportingCurrency")}
        >
          {currencies.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <FieldError state={state} name="reportingCurrency" />
      </p>

      <p>
        <label htmlFor="timezone">Timezone</label>
        <br />
        <select
          id="timezone"
          name="timezone"
          required
          defaultValue={values.timezone}
          {...invalid(state, "timezone")}
        >
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        <FieldError state={state} name="timezone" />
      </p>

      <p>
        <label htmlFor="fiscalYearStartMonth">Financial year starts</label>
        <br />
        <select
          id="fiscalYearStartMonth"
          name="fiscalYearStartMonth"
          required
          defaultValue={values.fiscalYearStartMonth}
          {...invalid(state, "fiscalYearStartMonth")}
        >
          <option value="">Choose a month</option>
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <FieldError state={state} name="fiscalYearStartMonth" />
      </p>

      <button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Saving…" : "Save and continue"}
      </button>
    </form>
  );
}

/** A single-button step action (continue / confirm). */
export function StepForm({
  action,
  label,
  pendingLabel,
}: {
  action: (prev: OnboardingFormState) => Promise<OnboardingFormState>;
  label: string;
  pendingLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, idleState);
  return (
    <form action={formAction}>
      <ErrorSummary state={state} />
      <button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? pendingLabel : label}
      </button>
    </form>
  );
}
