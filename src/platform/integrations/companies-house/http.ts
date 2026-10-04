import { z } from "zod";
import {
  CompanyRegistryUnavailableError,
  normaliseCompanyNumber,
  type CompanyRecord,
  type CompanyRegistry,
  type CompanySearchResult,
} from "./types";

export const COMPANIES_HOUSE_API = "https://api.company-information.service.gov.uk";

// Only the fields DirectorXO uses; unknown fields are ignored.
const address = z
  .object({
    address_line_1: z.string().optional(),
    address_line_2: z.string().optional(),
    locality: z.string().optional(),
    region: z.string().optional(),
    postal_code: z.string().optional(),
    country: z.string().optional(),
  })
  .optional();

const profileSchema = z.object({
  company_number: z.string(),
  company_name: z.string(),
  company_status: z.string(),
  type: z.string().optional(),
  date_of_creation: z.string().optional(),
  registered_office_address: address,
});

const searchSchema = z.object({
  items: z
    .array(
      z.object({
        company_number: z.string(),
        title: z.string(),
        company_status: z.string().optional(),
        address_snippet: z.string().optional(),
      }),
    )
    .default([]),
});

type Options = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
};

/** Companies House Public Data API (HTTP Basic auth with the API key as username). */
export class CompaniesHouseRegistry implements CompanyRegistry {
  readonly configured = true;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly now: () => Date;

  constructor(private readonly options: Options) {
    this.baseUrl = (options.baseUrl ?? COMPANIES_HOUSE_API).replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.now = options.now ?? (() => new Date());
  }

  private async request(path: string): Promise<unknown | null> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        headers: {
          authorization: `Basic ${Buffer.from(`${this.options.apiKey}:`).toString("base64")}`,
          accept: "application/json",
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const timedOut =
        error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      throw new CompanyRegistryUnavailableError(timedOut ? "timeout" : "network");
    }
    if (response.status === 404) return null;
    if (response.status === 401 || response.status === 403) {
      throw new CompanyRegistryUnavailableError("unauthorised", response.status);
    }
    if (response.status === 429) throw new CompanyRegistryUnavailableError("rate_limited", 429);
    if (!response.ok) throw new CompanyRegistryUnavailableError("provider_error", response.status);
    try {
      return await response.json();
    } catch {
      throw new CompanyRegistryUnavailableError("invalid_response", response.status);
    }
  }

  async getCompany(companyNumber: string): Promise<CompanyRecord | null> {
    const number = normaliseCompanyNumber(companyNumber);
    if (!number) return null;
    const reference = `/company/${encodeURIComponent(number)}`;
    const body = await this.request(reference);
    if (body === null) return null;
    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) throw new CompanyRegistryUnavailableError("invalid_response");
    const p = parsed.data;
    const office = p.registered_office_address;
    return {
      companyNumber: p.company_number,
      name: p.company_name,
      status: p.company_status,
      type: p.type,
      incorporatedOn: p.date_of_creation,
      registeredOffice: office
        ? {
            addressLine1: office.address_line_1,
            addressLine2: office.address_line_2,
            locality: office.locality,
            region: office.region,
            postalCode: office.postal_code,
            country: office.country,
          }
        : undefined,
      source: { provider: "companies-house", reference, retrievedAt: this.now().toISOString() },
    };
  }

  async searchCompanies(query: string, limit = 10): Promise<CompanySearchResult[]> {
    const q = query.trim().slice(0, 160);
    if (!q) return [];
    const size = Math.min(Math.max(limit, 1), 20);
    const body = await this.request(
      `/search/companies?q=${encodeURIComponent(q)}&items_per_page=${size}`,
    );
    if (body === null) return [];
    const parsed = searchSchema.safeParse(body);
    if (!parsed.success) throw new CompanyRegistryUnavailableError("invalid_response");
    return parsed.data.items.slice(0, size).map((i) => ({
      companyNumber: i.company_number,
      name: i.title,
      status: i.company_status ?? "unknown",
      addressSnippet: i.address_snippet,
    }));
  }
}
