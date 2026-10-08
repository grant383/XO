import { sampleAlerts, sampleMetrics, samplePerformance, sampleServices } from "./fixtures";
import styles from "./technology.module.css";

export function TechnologyScreen() {
  return (
    <div className={styles.screen}>
      <section className={styles.hero}>
        <h1>
          Technology Monitor <span>· Sample data</span>
        </h1>
        <p>System health, uptime, and performance monitoring</p>
      </section>
      <div className={styles.body}>
        <dl className={styles.metrics}>
          {sampleMetrics.map(([label, value, status]) => (
            <div className={styles.metric} key={label}>
              <dt>{label}</dt>
              <dd>
                <strong>{value}</strong>
                <span className={styles.metricStatus}>
                  <img src="/ui/command/success.svg" width="6" height="6" alt="" />
                  {status}
                </span>
              </dd>
            </div>
          ))}
        </dl>
        <section className={styles.tablePanel} aria-labelledby="services-title">
          <h2 id="services-title" className="visually-hidden">
            Service health
          </h2>
          <div
            className={styles.tableScroll}
            role="region"
            aria-label="Sample service health"
            tabIndex={0}
          >
            <table aria-label="Sample integration and service health">
              <colgroup>
                {[256, 160, 120, 150, 180, 0].map((width, i) => (
                  <col key={i} style={width ? { width } : undefined} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {["Service", "Status", "Uptime", "Response Time", "Last Incident", "Health"].map(
                    (label) => (
                      <th scope="col" key={label}>
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {sampleServices.map(([name, status, uptime, response, incident, health]) => {
                  const degraded = status === "Degraded";
                  return (
                    <tr key={name}>
                      <th scope="row">{name}</th>
                      <td>
                        <span
                          className={`${styles.status} ${degraded ? styles.amber : styles.green}`}
                        >
                          <img
                            src={`/ui/technology/${degraded ? "degraded" : "operational"}.svg`}
                            width="5"
                            height="5"
                            alt=""
                          />
                          {status}
                        </span>
                      </td>
                      <td className={styles.mono}>{uptime}</td>
                      <td className={styles.mono}>{response}</td>
                      <td className={styles.muted}>{incident}</td>
                      <td className={`${styles.health} ${degraded ? styles.amber : styles.green}`}>
                        {health}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <div className={styles.columns}>
          <section className={styles.panel} aria-labelledby="alerts-title">
            <h2 id="alerts-title">Active Alerts ({sampleAlerts.length})</h2>
            <ul className={styles.alerts}>
              {sampleAlerts.map(([tag, level, title, detail]) => (
                <li className={tag === "DEG" ? styles.alertAmber : styles.alertBlue} key={title}>
                  <abbr className={styles.tag} title={level}>
                    {tag}
                  </abbr>
                  <div>
                    <p className={styles.alertTitle}>{title}</p>
                    <p className={styles.alertDetail}>{detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section className={styles.panel} aria-labelledby="performance-title">
            <h2 id="performance-title">System Performance</h2>
            <ul className={styles.performance}>
              {samplePerformance.map(([label, asset, width, height, value, change, trend]) => (
                <li key={label}>
                  <p className={styles.metricName}>
                    <span>{label}</span>
                    <span className={styles.muted}>System metric</span>
                  </p>
                  <span className={styles.sparkline}>
                    <img
                      src={`/ui/technology/${asset}.svg`}
                      width={width}
                      height={height}
                      alt={`Sample ${label} trend ${trend}`}
                    />
                  </span>
                  <p className={styles.reading}>
                    <strong>{value}</strong>
                    <span>{change}</span>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <details className={styles.notes}>
          <summary>Sample records &amp; source notes</summary>
          <p>
            Fixed Figma 10:4344 fixtures, not live GS Appliance technology records. No ServiceM8,
            Xero, Stripe, Google Workspace, email, Zapier, HubSpot or backup provider is connected
            to this screen, and no monitoring source reports uptime, latency, errors, users or
            resource usage. These read-only samples are never saved.
          </p>
          <p>
            The status labels follow the reference: the header reads “All systems operational” while
            the sample table shows Email Delivery as degraded. Uptime, response time and incident
            timings are illustrative values with no measurement window or freshness. Sparklines are
            the exact design illustrations, not plotted series.
          </p>
        </details>
      </div>
    </div>
  );
}
