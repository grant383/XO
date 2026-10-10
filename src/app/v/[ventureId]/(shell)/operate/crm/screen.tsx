import { ClientDirectory } from "./client-directory";
import {
  sampleChurnRisks,
  sampleClients,
  sampleMetrics,
  sampleNextActions,
  sampleNps,
  sampleSatisfactionTrend,
  sampleSegments,
  type SampleClient,
} from "./fixtures";
import styles from "./crm.module.css";

export function CrmScreen({ clients = sampleClients }: { clients?: readonly SampleClient[] }) {
  return (
    <div className={styles.screen}>
      <section className={styles.hero}>
        <h1>
          Client Management <span>· Sample data</span>
        </h1>
        <p>Relationships, job history, satisfaction, and lifetime value</p>
      </section>
      <div className={styles.body}>
        <dl className={styles.metrics}>
          {sampleMetrics.map(([label, value, note, tone]) => (
            <div className={styles.metric} key={label}>
              <dt>{label}</dt>
              <dd>
                <strong>{value}</strong>
                <span className={tone === "green" ? styles.green : undefined}>{note}</span>
              </dd>
            </div>
          ))}
        </dl>
        <ClientDirectory clients={clients} />
        <div className={styles.columns}>
          <section className={styles.panel} aria-labelledby="segments-title">
            <h2 id="segments-title">Client segments (by revenue)</h2>
            <div className={styles.segmentBar} aria-hidden="true">
              {sampleSegments.map(([label, key, share]) => (
                <span key={label} className={styles[key]} style={{ flexGrow: share }} />
              ))}
            </div>
            <ul className={styles.segments}>
              {sampleSegments.map(([label, key, share, revenue]) => (
                <li key={label}>
                  <span className={styles.segmentName}>
                    <img src={`/ui/crm/segment-${key}.svg`} width="8" height="8" alt="" />
                    {label}
                  </span>
                  <span className={styles.segmentValue}>
                    <span className={styles.muted}>{share}%</span>
                    <strong>{revenue}</strong>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <div className={`${styles.panel} ${styles.relationship}`}>
            <section aria-labelledby="churn-title">
              <h2 id="churn-title">30-day churn risk</h2>
              <ul className={styles.risks}>
                {sampleChurnRisks.map(([client, reason]) => (
                  <li key={client}>
                    <span>
                      <strong>{client}</strong>
                      <span className={styles.muted}>{reason}</span>
                    </span>
                    <img src="/ui/command/warning.svg" width="6" height="6" alt="At risk" />
                  </li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="relationship-title" className={styles.relationshipMetrics}>
              <div className={styles.relationshipHead}>
                <h2 id="relationship-title">Relationship metrics</h2>
                <p className={styles.nps}>NPS: {sampleNps}</p>
              </div>
              <figure className={styles.trend}>
                <figcaption className={styles.muted}>Satisfaction Trend (Last 6 Months)</figcaption>
                <div
                  className={styles.bars}
                  role="img"
                  aria-label="Sample satisfaction trend over six months: generally rising, highest in the latest month"
                >
                  {sampleSatisfactionTrend.map((height, i) => (
                    <span key={i} style={{ height }} />
                  ))}
                </div>
              </figure>
              <div className={styles.actions}>
                <h3>Next actions</h3>
                <ul>
                  {sampleNextActions.map((action) => (
                    <li key={action}>
                      <img src="/ui/crm/chevron-right.svg" width="10" height="10" alt="" />
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>
        </div>
        <details className={styles.notes}>
          <summary>Sample records &amp; source notes</summary>
          <p>
            Fixed Figma 14:4 fixtures, not live GS Appliance client records. No CRM, job, review or
            payment source is connected, and search, filters and sorting work only on the ten sample
            clients in your browser. Nothing is fetched or saved.
          </p>
          <p>
            The reference figures are design samples and are not internally consistent: 64 of 87
            clients is 73.6% (shown as 73.5%), and segment revenue (£52K, £28K, £8K, £4K) does not
            match the segment shares (42%, 38%, 12%, 8%). The directory shows ten of the 87 sample
            clients. The satisfaction trend is an illustration without a numeric score series. Next
            actions are suggestions only and do not create tasks.
          </p>
        </details>
      </div>
    </div>
  );
}
