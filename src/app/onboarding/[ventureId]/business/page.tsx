import type { Metadata } from "next";
import { COMMON_CURRENCIES, CURRENCIES, MONTHS, SECTORS, TIMEZONES } from "@/modules/ventures";
import { lookupCompanyAction, saveBusinessAction } from "../../actions";
import { BusinessForm } from "../../forms";
import { loadOnboardingPage } from "../../guard";
import { ForbiddenNotice } from "../forbidden-notice";
import { StepIndicator } from "../steps";

export const metadata: Metadata = { title: "Business details" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ ventureId: string }> };

const currencyName = new Intl.DisplayNames(["en-GB"], { type: "currency" });

export default async function BusinessStepPage({ params }: Props) {
  const { ventureId } = await params;
  const ctx = await loadOnboardingPage(ventureId);
  if (ctx.kind === "forbidden") return <ForbiddenNotice />;
  const v = ctx.view.venture;

  const others = [...CURRENCIES]
    .filter((c) => !(COMMON_CURRENCIES as readonly string[]).includes(c))
    .sort();
  const currencies = [...COMMON_CURRENCIES, ...others].map((c) => ({
    value: c,
    label: `${c} — ${currencyName.of(c) ?? c}`,
  }));

  return (
    <>
      <StepIndicator view={ctx.view} current="business" />
      <h1>Business details</h1>
      <BusinessForm
        action={saveBusinessAction.bind(null, ventureId)}
        lookup={lookupCompanyAction.bind(null, ventureId)}
        defaults={{
          name: v.name,
          legalName: v.legalName ?? "",
          companyNumber: v.companyNumber ?? "",
          sector: v.sector ?? "",
          reportingCurrency: v.reportingCurrency,
          timezone: v.timezone,
          fiscalYearStartMonth: v.fiscalYearStartMonth ? String(v.fiscalYearStartMonth) : "",
        }}
        sectors={SECTORS.map((s) => ({ value: s.code, label: s.label }))}
        currencies={currencies}
        timezones={[...TIMEZONES].sort()}
        months={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
      />
    </>
  );
}
