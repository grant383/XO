import { z } from "zod";
import { normaliseCompanyNumber } from "@/platform/integrations/companies-house";

/**
 * Venture settings captured by onboarding (spec §16 ventures; ADR-0012). The spec does
 * not enumerate sectors, so this list is the DirectorXO P0 taxonomy; codes are stable
 * identifiers stored in `ventures.sector`.
 */
export const SECTORS = [
  { code: "professional_services", label: "Professional services" },
  { code: "trades_construction", label: "Trades and construction" },
  { code: "home_services", label: "Home services" },
  { code: "retail_ecommerce", label: "Retail and e-commerce" },
  { code: "hospitality", label: "Hospitality and food" },
  { code: "health_wellness", label: "Health and wellness" },
  { code: "technology", label: "Technology and software" },
  { code: "creative_media", label: "Creative and media" },
  { code: "manufacturing", label: "Manufacturing" },
  { code: "property", label: "Property" },
  { code: "education_training", label: "Education and training" },
  { code: "transport_logistics", label: "Transport and logistics" },
  { code: "other", label: "Other" },
] as const;
export type SectorCode = (typeof SECTORS)[number]["code"];

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** ISO 4217 codes and IANA zones known to the runtime (Node/ICU). */
export const CURRENCIES: ReadonlySet<string> = new Set(Intl.supportedValuesOf("currency"));
export const TIMEZONES: ReadonlySet<string> = new Set([
  ...Intl.supportedValuesOf("timeZone"),
  "UTC",
]);

/** Currencies offered first in the UI; any ISO 4217 code is accepted. */
export const COMMON_CURRENCIES = ["GBP", "EUR", "USD"] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null);

export const ventureNameInput = z.object({
  name: z.string().trim().min(1, "Enter the business name.").max(200),
});

export const businessDetailsInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the business name.")
    .max(200, "Use at most 200 characters."),
  legalName: optionalText(200),
  companyNumber: z
    .string()
    .trim()
    .default("")
    .transform((v, ctx) => {
      if (v === "") return null;
      const normalised = normaliseCompanyNumber(v);
      if (!normalised) {
        ctx.addIssue({
          code: "custom",
          message: "Enter an 8-character Companies House number, for example 01234567 or SC123456.",
        });
        return z.NEVER;
      }
      return normalised;
    }),
  sector: z.enum(SECTORS.map((s) => s.code) as [SectorCode, ...SectorCode[]], {
    error: "Choose a sector.",
  }),
  reportingCurrency: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => /^[A-Z]{3}$/.test(v) && CURRENCIES.has(v), "Choose a valid ISO 4217 currency."),
  timezone: z
    .string()
    .trim()
    .refine((v) => TIMEZONES.has(v), "Choose a valid timezone."),
  fiscalYearStartMonth: z.coerce
    .number({ error: "Choose the month your financial year starts." })
    .int()
    .min(1, "Choose the month your financial year starts.")
    .max(12, "Choose the month your financial year starts."),
});
export type BusinessDetailsInput = z.input<typeof businessDetailsInput>;
export type BusinessDetails = z.output<typeof businessDetailsInput>;
