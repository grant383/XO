import { companiesHouseEnv } from "@/platform/config/env";
import {
  CompaniesHouseRegistry,
  UnconfiguredCompanyRegistry,
  type CompanyRegistry,
} from "@/platform/integrations/companies-house";

let registry: CompanyRegistry | undefined;

/** The configured company registry. Without an API key, lookups report "unavailable". */
export function companyRegistry(): CompanyRegistry {
  if (!registry) {
    const env = companiesHouseEnv();
    registry = env.COMPANIES_HOUSE_API_KEY
      ? new CompaniesHouseRegistry({
          apiKey: env.COMPANIES_HOUSE_API_KEY,
          baseUrl: env.COMPANIES_HOUSE_API_URL,
        })
      : new UnconfiguredCompanyRegistry();
  }
  return registry;
}

/** Test seam. */
export function setCompanyRegistryForTests(next: CompanyRegistry | undefined) {
  registry = next;
}
