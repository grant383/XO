/**
 * Company registry adapter (spec §6 "Integrations are adapters", §17 Companies House).
 * Domain code depends on this interface only; provider payloads never leave the adapter.
 */
export type RegisteredOffice = {
  addressLine1?: string;
  addressLine2?: string;
  locality?: string;
  region?: string;
  postalCode?: string;
  country?: string;
};

/** Provenance recorded with every provider-sourced value (spec §16 provenance). */
export type SourceMetadata = {
  provider: "companies-house";
  /** Provider resource path, e.g. `/company/01234567`. */
  reference: string;
  retrievedAt: string;
};

export type CompanyRecord = {
  companyNumber: string;
  name: string;
  /** Provider status, e.g. `active`, `dissolved`, `liquidation`. */
  status: string;
  type?: string;
  incorporatedOn?: string;
  registeredOffice?: RegisteredOffice;
  source: SourceMetadata;
};

export type CompanySearchResult = {
  companyNumber: string;
  name: string;
  status: string;
  addressSnippet?: string;
};

export interface CompanyRegistry {
  /** Whether live lookups can be attempted (false when no credentials are configured). */
  readonly configured: boolean;
  /** Returns `null` when no company has that number. Throws `CompanyRegistryUnavailableError`. */
  getCompany(companyNumber: string): Promise<CompanyRecord | null>;
  searchCompanies(query: string, limit?: number): Promise<CompanySearchResult[]>;
}

export type UnavailableReason =
  | "not_configured"
  | "timeout"
  | "network"
  | "rate_limited"
  | "unauthorised"
  | "provider_error"
  | "invalid_response";

/** The registry could not answer. Callers must fall back to manual entry. */
export class CompanyRegistryUnavailableError extends Error {
  constructor(
    readonly reason: UnavailableReason,
    readonly status?: number,
  ) {
    super(`Company registry unavailable (${reason}${status ? ` ${status}` : ""})`);
    this.name = "CompanyRegistryUnavailableError";
  }
}

/**
 * Normalises a UK company number: strips spaces, upper-cases and left-pads purely numeric
 * numbers to 8 digits. Returns `null` if the result is not 8 digits or a 2-letter prefix
 * followed by 6 digits (e.g. `SC123456`, `OC301234`).
 */
export function normaliseCompanyNumber(input: string): string | null {
  const compact = input.replace(/\s+/g, "").toUpperCase();
  if (/^\d{1,8}$/.test(compact)) return compact.padStart(8, "0");
  if (/^[A-Z]{2}\d{6}$/.test(compact)) return compact;
  return null;
}
