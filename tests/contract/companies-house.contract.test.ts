import { describe, expect, it, vi } from "vitest";
import profile from "../fixtures/companies-house/company-profile.json";
import search from "../fixtures/companies-house/search.json";
import {
  CompaniesHouseRegistry,
  CompanyRegistryUnavailableError,
  FixtureCompanyRegistry,
  normaliseCompanyNumber,
  UnconfiguredCompanyRegistry,
  type CompanyRegistry,
} from "@/platform/integrations/companies-house";

/**
 * Provider adapter contract (spec §18 "Provider adapter contract tests"). The same
 * behavioural contract is run against the HTTP adapter (with Companies House-shaped
 * fixture responses) and the fixture registry used in tests and development.
 */
const API_KEY = "ch-test-api-key-0123456789";
const FIXED_NOW = new Date("2026-10-04T12:00:00.000Z");

function stubFetch(routes: Record<string, () => Response>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const handler = routes[url.pathname];
    return handler ? handler() : new Response(JSON.stringify({ errors: [] }), { status: 404 });
  });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function httpRegistry() {
  const fetchImpl = stubFetch({
    "/company/01234567": () => json(profile),
    "/search/companies": () => json(search),
  });
  return new CompaniesHouseRegistry({
    apiKey: API_KEY,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    now: () => FIXED_NOW,
  });
}

function fixtureRegistry() {
  return new FixtureCompanyRegistry([
    {
      companyNumber: "01234567",
      name: "DIRECTORXO TEST LIMITED",
      status: "active",
      type: "ltd",
      incorporatedOn: "2019-04-01",
      registeredOffice: {
        addressLine1: "1 Test Street",
        locality: "London",
        postalCode: "EC1A 1AA",
        country: "United Kingdom",
      },
    },
    { companyNumber: "SC123456", name: "DIRECTORXO SCOTLAND LTD", status: "dissolved" },
  ]);
}

const implementations: Array<[string, () => CompanyRegistry]> = [
  ["CompaniesHouseRegistry (HTTP, fixture responses)", httpRegistry],
  ["FixtureCompanyRegistry", fixtureRegistry],
];

describe.each(implementations)("CompanyRegistry contract: %s", (_name, make) => {
  it("retrieves company name, number, status, registered office and source metadata", async () => {
    const record = await make().getCompany("01234567");
    expect(record).toMatchObject({
      companyNumber: "01234567",
      name: "DIRECTORXO TEST LIMITED",
      status: "active",
      type: "ltd",
      incorporatedOn: "2019-04-01",
      registeredOffice: {
        addressLine1: "1 Test Street",
        locality: "London",
        postalCode: "EC1A 1AA",
      },
      source: { provider: "companies-house", reference: "/company/01234567" },
    });
    expect(Number.isNaN(Date.parse(record!.source.retrievedAt))).toBe(false);
  });

  it("normalises the requested number before lookup", async () => {
    expect((await make().getCompany(" 1234567 "))?.companyNumber).toBe("01234567");
  });

  it("returns null for an unknown or malformed company number", async () => {
    expect(await make().getCompany("09999999")).toBeNull();
    expect(await make().getCompany("not-a-number")).toBeNull();
  });

  it("searches companies by name", async () => {
    const results = await make().searchCompanies("directorxo");
    expect(results.map((r) => r.companyNumber)).toEqual(["01234567", "SC123456"]);
    expect(results[1]).toMatchObject({ name: "DIRECTORXO SCOTLAND LTD", status: "dissolved" });
  });

  it("returns no results for a blank query", async () => {
    expect(await make().searchCompanies("   ")).toEqual([]);
  });
});

describe("CompaniesHouseRegistry (HTTP specifics)", () => {
  it("authenticates with HTTP Basic (API key as username) and encodes queries", async () => {
    const fetchImpl = stubFetch({ "/search/companies": () => json(search) });
    const registry = new CompaniesHouseRegistry({
      apiKey: API_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await registry.searchCompanies("a&b=c", 5);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://api.company-information.service.gov.uk/search/companies?q=a%26b%3Dc&items_per_page=5",
    );
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Basic ${Buffer.from(`${API_KEY}:`).toString("base64")}`,
    );
  });

  it.each([
    [429, "rate_limited"],
    [401, "unauthorised"],
    [500, "provider_error"],
    [503, "provider_error"],
  ])("reports HTTP %i as unavailable (%s)", async (status, reason) => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status }));
    const registry = new CompaniesHouseRegistry({
      apiKey: API_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const error = await registry.getCompany("01234567").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CompanyRegistryUnavailableError);
    expect(error).toMatchObject({ reason, status });
  });

  it("reports network failures and timeouts as unavailable without leaking the key", async () => {
    const network = new CompaniesHouseRegistry({
      apiKey: API_KEY,
      fetchImpl: (async () => {
        throw new TypeError(`fetch failed ${API_KEY}`);
      }) as unknown as typeof fetch,
    });
    const err = await network.getCompany("01234567").catch((e: unknown) => e);
    expect(err).toMatchObject({ reason: "network" });
    expect(String((err as Error).message)).not.toContain(API_KEY);

    const slow = new CompaniesHouseRegistry({
      apiKey: API_KEY,
      timeoutMs: 20,
      fetchImpl: ((_: string, init: RequestInit) =>
        new Promise((_resolve, reject) =>
          init.signal!.addEventListener("abort", () => reject(init.signal!.reason)),
        )) as unknown as typeof fetch,
    });
    expect(await slow.getCompany("01234567").catch((e: unknown) => e)).toMatchObject({
      reason: "timeout",
    });
  });

  it("rejects malformed provider payloads as unavailable rather than guessing", async () => {
    const registry = new CompaniesHouseRegistry({
      apiKey: API_KEY,
      fetchImpl: (async () => json({ company_name: 42 })) as unknown as typeof fetch,
    });
    expect(await registry.getCompany("01234567").catch((e: unknown) => e)).toMatchObject({
      reason: "invalid_response",
    });
  });
});

describe("unavailable registries", () => {
  it("an unconfigured registry reports not_configured", async () => {
    const registry = new UnconfiguredCompanyRegistry();
    expect(registry.configured).toBe(false);
    expect(await registry.getCompany("01234567").catch((e: unknown) => e)).toMatchObject({
      reason: "not_configured",
    });
  });

  it("a fixture registry can simulate an outage", async () => {
    const registry = fixtureRegistry() as FixtureCompanyRegistry;
    registry.available = false;
    await expect(registry.getCompany("01234567")).rejects.toBeInstanceOf(
      CompanyRegistryUnavailableError,
    );
  });
});

describe("normaliseCompanyNumber", () => {
  it.each([
    ["01234567", "01234567"],
    ["1234567", "01234567"],
    ["sc 123456", "SC123456"],
    ["OC301234", "OC301234"],
    ["123456789", null],
    ["S1234567", null],
    ["", null],
  ])("%s -> %s", (input, expected) => {
    expect(normaliseCompanyNumber(input)).toBe(expected);
  });
});
