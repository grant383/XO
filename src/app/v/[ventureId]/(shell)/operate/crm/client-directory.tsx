"use client";

import { useId, useState } from "react";
import { Button, EmptyState, Icon } from "@/ui";
import {
  DEFAULT_QUERY,
  formatDate,
  formatPounds,
  nextSort,
  queryClients,
  type DirectoryQuery,
  type SortKey,
} from "./directory";
import type { SampleClient } from "./fixtures";
import styles from "./crm.module.css";

const COLUMNS: { label: string; sort?: SortKey; width?: number; numeric?: boolean }[] = [
  { label: "Client", sort: "name" },
  { label: "Type", width: 110 },
  { label: "Total Spend", sort: "spend", width: 110, numeric: true },
  { label: "Jobs", sort: "jobs", width: 70, numeric: true },
  { label: "Last Job", sort: "lastJob", width: 100 },
  { label: "Satisfaction", sort: "satisfaction", width: 100 },
  { label: "LTV Tier", width: 100 },
  { label: "Status", width: 90 },
];

const TIER_CLASS = {
  Platinum: styles.platinum,
  Gold: styles.gold,
  Silver: styles.neutral,
  Bronze: styles.neutral,
  New: styles.neutral,
} as const;

/**
 * Client directory (Figma 14:4) with search, type/status filters and sortable columns.
 * Everything runs on the fixed sample list in the browser; nothing is fetched or saved.
 */
export function ClientDirectory({ clients }: { clients: readonly SampleClient[] }) {
  const [query, setQuery] = useState<DirectoryQuery>(DEFAULT_QUERY);
  const id = useId();
  const rows = queryClients(clients, query);
  const filtered = query.search.trim() !== "" || query.type !== "all" || query.status !== "all";
  const update = (patch: Partial<DirectoryQuery>) => setQuery((q) => ({ ...q, ...patch }));

  return (
    <section className={styles.directory} aria-labelledby={`${id}-title`}>
      <div className={styles.directoryBar}>
        <h2 id={`${id}-title`}>Client directory</h2>
        {clients.length > 0 && (
          <form
            className={styles.filters}
            role="search"
            aria-label="Filter sample clients"
            onSubmit={(e) => e.preventDefault()}
          >
            <label className={styles.search}>
              <span className="visually-hidden">Search clients</span>
              <Icon name="search" />
              <input
                type="search"
                value={query.search}
                placeholder="Search clients"
                autoComplete="off"
                onChange={(e) => update({ search: e.target.value })}
              />
            </label>
            <label className={styles.select}>
              <span className="visually-hidden">Client type</span>
              <select
                value={query.type}
                onChange={(e) => update({ type: e.target.value as DirectoryQuery["type"] })}
              >
                <option value="all">All types</option>
                <option value="Commercial">Commercial</option>
                <option value="Residential">Residential</option>
                <option value="Institutional">Institutional</option>
              </select>
            </label>
            <label className={styles.select}>
              <span className="visually-hidden">Client status</span>
              <select
                value={query.status}
                onChange={(e) => update({ status: e.target.value as DirectoryQuery["status"] })}
              >
                <option value="all">All statuses</option>
                <option value="Active">Active</option>
                <option value="At Risk">At Risk</option>
              </select>
            </label>
          </form>
        )}
      </div>
      <p className="visually-hidden" role="status" aria-live="polite">
        {filtered ? `${rows.length} of ${clients.length} sample clients shown` : ""}
      </p>
      {clients.length === 0 ? (
        <EmptyState
          title="No clients yet"
          description="Clients appear here once a CRM source is connected or the first client is added."
          icon="users"
          as="h3"
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No sample clients match"
          description="Try a different name, type or status."
          icon="search"
          as="h3"
          action={
            <Button variant="secondary" onClick={() => setQuery(DEFAULT_QUERY)}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <div
          className={styles.tableScroll}
          role="region"
          aria-label="Sample client directory"
          tabIndex={0}
        >
          <table aria-label="Sample clients">
            <colgroup>
              {COLUMNS.map(({ label, width }) => (
                <col key={label} style={width ? { width } : undefined} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {COLUMNS.map(({ label, sort, numeric }) => (
                  <th
                    key={label}
                    scope="col"
                    className={numeric ? styles.numeric : undefined}
                    aria-sort={sort && query.sort === sort ? query.direction : undefined}
                  >
                    {sort ? (
                      <button
                        type="button"
                        className={styles.sort}
                        onClick={() => setQuery((q) => nextSort(q, sort))}
                      >
                        {label}
                        <span aria-hidden="true" className={styles.sortMark}>
                          {query.sort === sort ? (query.direction === "ascending" ? "↑" : "↓") : ""}
                        </span>
                      </button>
                    ) : (
                      label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((client) => (
                <tr key={client.name}>
                  <th scope="row">{client.name}</th>
                  <td className={styles.muted}>{client.type}</td>
                  <td className={styles.numeric}>{formatPounds(client.spend)}</td>
                  <td className={`${styles.numeric} ${styles.muted}`}>{client.jobs}</td>
                  <td className={styles.muted}>{formatDate(client.lastJob)}</td>
                  <td>
                    <span className={styles.rating}>
                      <img src="/ui/crm/star.svg" width="12" height="12" alt="" />
                      {client.satisfaction.toFixed(1)}
                      <span className="visually-hidden"> out of 5</span>
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.tier} ${TIER_CLASS[client.tier]}`}>
                      {client.tier}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`${styles.status} ${client.status === "Active" ? styles.active : styles.atRisk}`}
                    >
                      <img
                        src={`/ui/technology/${client.status === "Active" ? "operational" : "degraded"}.svg`}
                        width="5"
                        height="5"
                        alt=""
                      />
                      {client.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
