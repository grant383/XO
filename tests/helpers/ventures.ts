import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { FixtureCompanyRegistry } from "@/platform/integrations/companies-house";

/** A verified user inserted directly (identity flows are covered by the auth suites). */
export async function createUser(admin: Sql, label = "user") {
  const id = randomUUID();
  await admin`insert into users (id, name, email, email_verified)
              values (${id}, ${label}, ${`${label}-${id.slice(0, 8)}@example.test`}, true)`;
  return { userId: id, correlationId: `corr-${id.slice(0, 12)}` };
}

export const VALID_BUSINESS = {
  name: "Acme Plumbing",
  legalName: "",
  companyNumber: "",
  sector: "trades_construction",
  reportingCurrency: "GBP",
  timezone: "Europe/London",
  fiscalYearStartMonth: "4",
};

export function fixtureRegistry() {
  return new FixtureCompanyRegistry([
    {
      companyNumber: "01234567",
      name: "ACME PLUMBING LIMITED",
      status: "active",
      registeredOffice: { addressLine1: "1 Pipe Street", locality: "Leeds", postalCode: "LS1 1AA" },
    },
  ]);
}
