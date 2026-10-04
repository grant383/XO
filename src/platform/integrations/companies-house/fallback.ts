import {
  CompanyRegistryUnavailableError,
  normaliseCompanyNumber,
  type CompanyRecord,
  type CompanyRegistry,
  type CompanySearchResult,
} from "./types";

/** Used when no API key is configured: every lookup reports "unavailable". */
export class UnconfiguredCompanyRegistry implements CompanyRegistry {
  readonly configured = false;
  getCompany: CompanyRegistry["getCompany"] = async () => {
    throw new CompanyRegistryUnavailableError("not_configured");
  };
  searchCompanies: CompanyRegistry["searchCompanies"] = async () => {
    throw new CompanyRegistryUnavailableError("not_configured");
  };
}

/** Deterministic in-memory registry for tests and local development without a key. */
export class FixtureCompanyRegistry implements CompanyRegistry {
  readonly configured = true;
  available = true;
  private readonly records = new Map<string, Omit<CompanyRecord, "source">>();

  constructor(records: Array<Omit<CompanyRecord, "source">> = []) {
    for (const r of records) this.records.set(r.companyNumber, r);
  }

  async getCompany(companyNumber: string): Promise<CompanyRecord | null> {
    if (!this.available) throw new CompanyRegistryUnavailableError("network");
    const number = normaliseCompanyNumber(companyNumber);
    const record = number ? this.records.get(number) : undefined;
    if (!record) return null;
    return {
      ...record,
      source: {
        provider: "companies-house",
        reference: `/company/${record.companyNumber}`,
        retrievedAt: new Date().toISOString(),
      },
    };
  }

  async searchCompanies(query: string, limit = 10): Promise<CompanySearchResult[]> {
    if (!this.available) throw new CompanyRegistryUnavailableError("network");
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return [...this.records.values()]
      .filter((r) => r.name.toLowerCase().includes(q) || r.companyNumber === q.toUpperCase())
      .slice(0, Math.min(Math.max(limit, 1), 20))
      .map((r) => ({ companyNumber: r.companyNumber, name: r.name, status: r.status }));
  }
}
