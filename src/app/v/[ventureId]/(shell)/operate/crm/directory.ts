import type { ClientStatus, ClientType, SampleClient } from "./fixtures";

export type SortKey = "name" | "spend" | "jobs" | "lastJob" | "satisfaction";
export type SortDirection = "ascending" | "descending";
export type DirectoryQuery = {
  search: string;
  type: ClientType | "all";
  status: ClientStatus | "all";
  sort: SortKey;
  direction: SortDirection;
};

/** The reference order: highest lifetime spend first. */
export const DEFAULT_QUERY: DirectoryQuery = {
  search: "",
  type: "all",
  status: "all",
  sort: "spend",
  direction: "descending",
};

/** Text columns start A→Z; numeric and date columns start highest/latest first. */
export const FIRST_DIRECTION: Record<SortKey, SortDirection> = {
  name: "ascending",
  spend: "descending",
  jobs: "descending",
  lastJob: "descending",
  satisfaction: "descending",
};

/** Filters and sorts deterministically; ties fall back to client name. */
export function queryClients(clients: readonly SampleClient[], query: DirectoryQuery) {
  const needle = query.search.trim().toLocaleLowerCase("en-GB");
  const sign = query.direction === "ascending" ? 1 : -1;
  return clients
    .filter(
      (client) =>
        (!needle || client.name.toLocaleLowerCase("en-GB").includes(needle)) &&
        (query.type === "all" || client.type === query.type) &&
        (query.status === "all" || client.status === query.status),
    )
    .toSorted((a, b) => {
      const order =
        query.sort === "name" || query.sort === "lastJob"
          ? a[query.sort].localeCompare(b[query.sort], "en-GB")
          : a[query.sort] - b[query.sort];
      return order * sign || a.name.localeCompare(b.name, "en-GB");
    });
}

export function nextSort(query: DirectoryQuery, key: SortKey): DirectoryQuery {
  if (query.sort !== key) return { ...query, sort: key, direction: FIRST_DIRECTION[key] };
  return {
    ...query,
    direction: query.direction === "ascending" ? "descending" : "ascending",
  };
}

const pounds = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});
export const formatPounds = (value: number) => pounds.format(value);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** `2026-09-04` → `04 Sep 2026`, matching the reference (no time zone involved). */
export function formatDate(iso: string) {
  const [year, month, day] = iso.split("-");
  return `${day} ${MONTHS[Number(month) - 1]} ${year}`;
}
