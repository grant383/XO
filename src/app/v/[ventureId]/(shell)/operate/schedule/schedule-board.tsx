"use client";

import { useState } from "react";
import { Button, EmptyState } from "@/ui";
import {
  BOOKING_KINDS,
  CAPACITY_LEVELS,
  SAMPLE_WEEK_START,
  type AlertSeverity,
  type CapacityLevel,
  type SampleWeek,
} from "./fixtures";
import { addWeeks, formatWeek, workingDays } from "./week";
import styles from "./schedule.module.css";

const KIND_LABEL = Object.fromEntries(BOOKING_KINDS);
const LEVEL_LABEL: Record<CapacityLevel, string> = {
  ...(Object.fromEntries(CAPACITY_LEVELS) as Record<Exclude<CapacityLevel, "free">, string>),
  free: "Unbooked",
};
const SEVERITY_LABEL: Record<AlertSeverity, string> = { high: "HIGH", warn: "WARN", low: "LOW" };

/**
 * Scheduling board (Figma 14:438): week switcher, metrics, the team-by-day calendar,
 * capacity heatmap and alerts. Only the reference week has sample bookings; other weeks
 * show an empty state. Everything runs in the browser; nothing is fetched or saved.
 */
export function ScheduleBoard({
  weeks,
  initialWeek = SAMPLE_WEEK_START,
}: {
  weeks: Readonly<Record<string, SampleWeek>>;
  initialWeek?: string;
}) {
  const [weekStart, setWeekStart] = useState(initialWeek);
  const week = weeks[weekStart];
  const days = workingDays(weekStart);
  const weekLabel = formatWeek(weekStart);

  return (
    <>
      <div className={styles.hero}>
        <div>
          <h1>
            Job Scheduling <span>· Sample data</span>
          </h1>
          <p>Weekly calendar, team assignments, and capacity planning</p>
        </div>
        <div className={styles.switcher} role="group" aria-label="Week">
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => setWeekStart((w) => addWeeks(w, -1))}
          >
            <img src="/ui/schedule/chevron-left.svg" width="10" height="10" alt="" />
          </button>
          <p aria-live="polite">{weekLabel}</p>
          <button
            type="button"
            aria-label="Next week"
            onClick={() => setWeekStart((w) => addWeeks(w, 1))}
          >
            <img src="/ui/schedule/chevron-right.svg" width="10" height="10" alt="" />
          </button>
        </div>
      </div>
      <div className={styles.body}>
        {!week || week.members.length === 0 ? (
          <div className={styles.panel}>
            <EmptyState
              title="No sample jobs this week"
              description={`Sample bookings exist only for ${formatWeek(SAMPLE_WEEK_START)}. Live jobs appear here once scheduling and Google Calendar are connected.`}
              icon="clock-3"
              as="h2"
              action={
                weekStart === SAMPLE_WEEK_START ? undefined : (
                  <Button variant="secondary" onClick={() => setWeekStart(SAMPLE_WEEK_START)}>
                    Back to sample week
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <>
            <dl className={styles.metrics}>
              {week.metrics.map(([label, value, tone]) => (
                <div className={styles.metric} key={label}>
                  <dt>{label}</dt>
                  <dd className={tone === "amber" ? styles.amber : undefined}>{value}</dd>
                </div>
              ))}
            </dl>

            <section className={styles.calendar} aria-labelledby="calendar-title">
              <div className={styles.calendarHead}>
                <h2 id="calendar-title" className="visually-hidden">
                  Team calendar
                </h2>
                <ul className={styles.legend} aria-label="Booking types">
                  {BOOKING_KINDS.map(([kind, label]) => (
                    <li key={kind}>
                      <span className={`${styles.swatch} ${styles[kind]}`} aria-hidden="true" />
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
              <div
                className={styles.scroll}
                role="region"
                aria-label="Sample team calendar"
                tabIndex={0}
              >
                <table className={styles.grid} aria-label={`Sample bookings, ${weekLabel}`}>
                  <thead>
                    <tr>
                      <th scope="col">Team member</th>
                      {days.map((day) => (
                        <th scope="col" key={day.iso}>
                          <span className={styles.weekday}>{day.weekday}</span>
                          <span className={styles.date}>{day.label}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {week.members.map((member) => (
                      <tr key={member.name}>
                        <th scope="row">{member.name}</th>
                        {member.days.map((bookings, index) => (
                          <td key={days[index]?.iso}>
                            {bookings.length === 0 ? (
                              <span className="visually-hidden">No bookings</span>
                            ) : (
                              <ul className={styles.bookings}>
                                {bookings.map((booking) => (
                                  <li
                                    key={booking.label}
                                    className={`${styles.booking} ${styles[booking.kind]}`}
                                    title={booking.label}
                                  >
                                    <span className="visually-hidden">
                                      {KIND_LABEL[booking.kind]}:{" "}
                                    </span>
                                    {booking.label}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className={styles.split}>
              <section className={styles.panel} aria-labelledby="heatmap-title">
                <div className={styles.panelHead}>
                  <h2 id="heatmap-title">Capacity Heatmap</h2>
                  <ul className={styles.legend} aria-label="Capacity levels">
                    {CAPACITY_LEVELS.map(([level, label]) => (
                      <li key={level}>
                        <span className={`${styles.square} ${styles[level]}`} aria-hidden="true" />
                        {label}
                      </li>
                    ))}
                  </ul>
                </div>
                <div
                  className={styles.scroll}
                  role="region"
                  aria-label="Sample capacity heatmap"
                  tabIndex={0}
                >
                  <table className={styles.heatmap} aria-label={`Sample capacity, ${weekLabel}`}>
                    <colgroup>
                      <col className={styles.nameColumn} />
                      <col span={5} />
                    </colgroup>
                    <thead className="visually-hidden">
                      <tr>
                        <th scope="col">Team member and utilisation</th>
                        {days.map((day) => (
                          <th scope="col" key={day.iso}>
                            {day.weekday} {day.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {week.capacity.map((row) => (
                        <tr key={row.name}>
                          <th scope="row">
                            <span className={styles.member}>
                              <span>{row.name}</span>
                              <span className={row.utilisation === null ? styles.na : styles.util}>
                                {row.utilisation === null ? "N/A" : `${row.utilisation}%`}
                              </span>
                            </span>
                          </th>
                          {row.days.map((level, index) => (
                            <td key={days[index]?.iso}>
                              <span className={`${styles.bar} ${styles[level]}`} />
                              <span className="visually-hidden">{LEVEL_LABEL[level]}</span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section
                className={`${styles.panel} ${styles.alerts}`}
                aria-labelledby="alerts-title"
              >
                <div className={styles.panelHead}>
                  <h2 id="alerts-title">Scheduling Alerts</h2>
                </div>
                {week.alerts.length === 0 ? (
                  <p className={styles.noAlerts}>No scheduling alerts this week.</p>
                ) : (
                  <ul>
                    {week.alerts.map((alert) => (
                      <li key={alert.message}>
                        <span className={`${styles.severity} ${styles[alert.severity]}`}>
                          {SEVERITY_LABEL[alert.severity]}
                        </span>
                        <span className={styles.message} title={alert.message}>
                          {alert.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </>
  );
}
