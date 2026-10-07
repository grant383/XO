import { sampleClients, sampleFunnel, sampleLevers, sampleMetrics } from "./fixtures";
import styles from "./growth.module.css";

export function GrowthScreen() {
  return (
    <div className={styles.screen}>
      <section className={styles.hero}>
        <h1>
          Growth Engine <span>· Sample data</span>
        </h1>
        <p>Acquisition, retention, and expansion metrics</p>
      </section>
      <div className={styles.body}>
        <dl className={styles.metrics}>
          {sampleMetrics.map(([label, value, note]) => (
            <div className={styles.metric} key={label}>
              <dt>{label}</dt>
              <dd>
                <strong>{value}</strong>
                <span>{note}</span>
              </dd>
            </div>
          ))}
        </dl>
        <div className={styles.columns}>
          <div className={styles.column}>
            <section className={styles.panel} aria-labelledby="funnel-title">
              <h2 id="funnel-title">Customer acquisition funnel</h2>
              <ol className={styles.funnel}>
                {sampleFunnel.map(([label, value, conversion]) => (
                  <li key={label}>
                    <div className={styles.stage}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </div>
                    {conversion && (
                      <div className={styles.conversion}>
                        <span>↓ {conversion} Conversion</span>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </section>
            <section className={styles.panel} aria-labelledby="clients-title">
              <h2 id="clients-title">Top revenue clients</h2>
              <div
                className={styles.tableScroll}
                role="region"
                aria-label="Sample revenue clients"
                tabIndex={0}
              >
                <table aria-label="Sample top revenue clients">
                  <colgroup>
                    <col />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 80 }} />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 80 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      {["Client Name", "Total Spend", "Jobs", "Last Job", "Risk"].map((label) => (
                        <th scope="col" key={label}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sampleClients.map(([name, spend, jobs, date, risk]) => (
                      <tr key={name}>
                        <th scope="row">{name}</th>
                        <td>{spend}</td>
                        <td>{jobs}</td>
                        <td className={styles.muted}>{date}</td>
                        <td>
                          <span
                            className={`${styles.risk} ${risk === "Low" ? styles.green : risk === "Medium" ? styles.amber : styles.red}`}
                          >
                            {risk}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
          <div className={styles.column}>
            <section className={styles.panel} aria-labelledby="trend-title">
              <h2 id="trend-title">Revenue growth trend</h2>
              <figure className={styles.trend}>
                <div className={styles.chart}>
                  <img
                    src="/ui/operate-growth/revenue-trend.svg"
                    width="548"
                    height="141"
                    alt="Sample revenue trend: rises from November to February, dips in March, then rises in April. No numeric revenue series is connected."
                  />
                </div>
                <figcaption>
                  {["Nov", "Dec", "Jan", "Feb", "Mar", "Apr"].map((month) => (
                    <span key={month}>{month}</span>
                  ))}
                </figcaption>
              </figure>
            </section>
            <section className={styles.panel} aria-labelledby="levers-title">
              <h2 id="levers-title">Growth levers</h2>
              <ul className={styles.levers}>
                {sampleLevers.map(([label, value, color, width]) => (
                  <li key={label}>
                    <p>
                      <span>{label}</span>
                      <strong className={styles[color]}>{value}</strong>
                    </p>
                    <div className={styles.track} aria-hidden="true">
                      <span
                        className={styles[color]}
                        style={{ width: `${(width / 358) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
        <details className={styles.notes}>
          <summary>Sample records &amp; source notes</summary>
          <p>
            Fixed Figma 10:3734 fixtures, not live GS Appliance growth or pipeline records. No
            acquisition, retention, client revenue or advertising source is connected. These
            read-only samples are never saved.
          </p>
          <p>
            The sample period is April 2026. Conversion labels follow the reference: 86/2,400, 42/86
            and 14/42, rounded to one decimal place. The revenue chart is the exact Figma
            illustration; no numeric revenue series or fresh calculation is implied. Growth lever
            bars are illustrative design samples, not comparable performance percentages.
          </p>
        </details>
      </div>
    </div>
  );
}
