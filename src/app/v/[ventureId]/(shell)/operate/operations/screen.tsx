import { sampleJobs, sampleMetrics, sampleTeam } from "./fixtures";
import styles from "./operations.module.css";

export function OperationsScreen() {
  return (
    <div className={styles.screen}>
      <section className={styles.hero}>
        <h1>
          Operations <span>· Sample data</span>
        </h1>
        <p>Today&apos;s jobs, field team status, and service delivery</p>
      </section>
      <div className={styles.body}>
        <dl className={styles.metrics}>
          {sampleMetrics.map(([label, value, note], i) => (
            <div className={styles.metric} key={label}>
              <dt>{label}</dt>
              <dd>
                <strong className={i === 1 ? styles.warning : i === 2 ? styles.success : undefined}>
                  {value}
                </strong>
                {note && <span>{note}</span>}
              </dd>
            </div>
          ))}
        </dl>
        <section className={styles.panel} aria-labelledby="jobs-title">
          <h2 id="jobs-title">Today&apos;s job board</h2>
          <div
            className={styles.tableScroll}
            role="region"
            aria-label="Sample job board"
            tabIndex={0}
          >
            <table aria-label="Sample operational jobs">
              <colgroup>
                {[106, 160, 0, 160, 110, 110, 96].map((width, i) => (
                  <col key={i} style={width ? { width } : undefined} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {["Job #", "Client", "Service", "Assigned", "Time", "Status", "Value"].map(
                    (label) => (
                      <th key={label} scope="col">
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {sampleJobs.map(([id, client, service, assigned, time, status, value]) => (
                  <tr key={id}>
                    <th scope="row" className={styles.mono}>
                      {id}
                    </th>
                    <td className={styles.client}>{client}</td>
                    <td>{service}</td>
                    <td>{assigned}</td>
                    <td className={styles.time}>{time}</td>
                    <td>
                      <span
                        className={`${styles.badge} ${status === "Completed" ? styles.completed : status === "In Progress" ? styles.progress : styles.scheduled}`}
                      >
                        {status}
                      </span>
                    </td>
                    <td className={styles.value}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <div className={styles.columns}>
          <section className={styles.panel} aria-labelledby="team-title">
            <h2 id="team-title">Field team status</h2>
            <ul className={styles.team}>
              {sampleTeam.map(([initials, name, description, status]) => (
                <li key={name}>
                  <span className={styles.avatar} aria-hidden="true">
                    {initials}
                  </span>
                  <div className={styles.person}>
                    <p>{name}</p>
                    <p title={description}>{description}</p>
                  </div>
                  <span className={styles.availability}>
                    <img
                      src={`/ui/operations/${status === "Off-Duty" ? "off-duty" : "available"}.svg`}
                      width="6"
                      height="6"
                      alt=""
                    />
                    {status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className={`${styles.panel} ${styles.revenue}`} aria-labelledby="revenue-title">
            <h2 id="revenue-title">Today&apos;s revenue</h2>
            <div className={styles.gross}>
              <strong>£5,470</strong>
              <p>Gross combined booked value</p>
            </div>
            <img
              className={styles.divider}
              src="/ui/operations/divider.svg"
              width="352"
              height="1"
              alt=""
            />
            <dl className={styles.breakdown}>
              {[
                ["Completed", "£500", styles.success],
                ["In Progress (Expected)", "£4,285", styles.warning],
                ["Scheduled (Pending)", "£685", styles.blue],
              ].map(([label, value, color]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd className={color}>{value}</dd>
                </div>
              ))}
            </dl>
            <img
              className={styles.divider}
              src="/ui/operations/divider.svg"
              width="352"
              height="1"
              alt=""
            />
            <div className={styles.capacity}>
              <p>
                Capacity Utilisation <strong>71%</strong>
              </p>
              <div
                role="meter"
                aria-label="Sample capacity utilisation"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={71}
              >
                <span />
              </div>
              <small>5 of 7 available field units currently assigned</small>
            </div>
          </section>
        </div>
        <details className={styles.notes}>
          <summary>Sample records &amp; source notes</summary>
          <p>
            Fixed Figma 10:3462 fixtures, not live GS Appliance operational records. No dispatch,
            availability or revenue data is connected. Records are read-only and are never saved.
          </p>
          <p>
            The reference metrics are independent design samples: the board has 2 completed, 3
            in-progress and 3 scheduled jobs; its metric says 4 completed. The seven-person list has
            4 on-site members, 2 available and 1 off-duty; the reference deployment metric says 5/7.
            Revenue values do reconcile to the eight job rows. Booked value is not recognised
            revenue or cash collected.
          </p>
        </details>
      </div>
    </div>
  );
}
