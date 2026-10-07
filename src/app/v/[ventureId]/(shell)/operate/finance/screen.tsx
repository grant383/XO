import { FINANCE_FIXTURE as fixture } from "./fixture";
import styles from "./finance.module.css";

function tone(status: string) {
  return status === "Approved"
    ? styles.success
    : status === "Pending" || status === "Overdue"
      ? styles.warning
      : styles.muted;
}

function CashChart() {
  const segments = [
    { x: 42, y: 70, width: 80.89, angle: 8.53, asset: "line-1" },
    { x: 122, y: 82, width: 84.43, angle: -18.65, asset: "line-2" },
    { x: 202, y: 55, width: 80.31, angle: -5, asset: "line-3" },
    { x: 282, y: 48, width: 81.05, angle: -9.23, asset: "line-4" },
    { x: 362, y: 35, width: 81.05, angle: -9.23, asset: "line-4" },
  ];
  return (
    <div
      className={styles.chartScroll}
      tabIndex={0}
      role="region"
      aria-label="Sample cash-flow chart, March to August 2026. Illustrative bars and running balance; source has no numeric axis."
    >
      <div className={styles.chart} aria-hidden="true">
        {[40, 80, 120].map((y) => (
          <img
            key={y}
            className={styles.gridline}
            style={{ top: y - 1 }}
            src="/ui/finance/grid.svg"
            width="530"
            height="1"
            alt=""
          />
        ))}
        {fixture.cashChart.map((month, i) => (
          <div key={month.month} className={styles.month} style={{ left: 20 + i * 80 }}>
            <div className={styles.bars}>
              <span style={{ height: month.cashInHeight }} />
              <span style={{ height: month.cashOutHeight }} />
            </div>
            <span>{month.month}</span>
          </div>
        ))}
        {segments.map((line) => (
          <img
            key={line.x}
            className={styles.balanceLine}
            style={{
              left: line.x,
              width: line.width,
              top: line.y - 2,
              transform: `rotate(${line.angle}deg)`,
            }}
            src={`/ui/finance/${line.asset}.svg`}
            width={line.width}
            height="2"
            alt=""
          />
        ))}
        {fixture.cashChart.map((month, i) => (
          <img
            key={month.month}
            className={styles.point}
            style={{ left: 39 + i * 80, top: month.balanceY - 3 }}
            src="/ui/finance/point.svg"
            width="6"
            height="6"
            alt=""
          />
        ))}
      </div>
    </div>
  );
}

export function FinanceScreen() {
  return (
    <div className={styles.screen}>
      <header className={styles.hero}>
        <h1>
          Finance <span>· Sample data</span>
        </h1>
        <p>Financial position and cash management · fixed August 2026 examples</p>
      </header>
      <div className={styles.body}>
        <dl className={styles.metrics}>
          {fixture.metrics.map((metric) => (
            <div key={metric.label} className={styles.metric}>
              <dt>{metric.label}</dt>
              <dd>
                <strong>{metric.value}</strong>
                {"status" in metric && <span className={styles.healthy}>{metric.status}</span>}
              </dd>
            </div>
          ))}
        </dl>
        <div className={styles.columns}>
          <div className={styles.column}>
            <section className={styles.panel} aria-labelledby="cash-title">
              <div className={styles.panelHead}>
                <h2 id="cash-title">6-month cash flow &amp; running balance</h2>
                <div className={styles.legend}>
                  <span>
                    <i />
                    Cash In
                  </span>
                  <span>
                    <i />
                    Cash Out
                  </span>
                </div>
              </div>
              <CashChart />
            </section>
            <section className={styles.panel} aria-labelledby="payables-title">
              <div className={styles.panelHead}>
                <h2 id="payables-title">Upcoming liabilities (accounts payable)</h2>
                <span className={styles.total}>Total Due: £6,800</span>
              </div>
              <div
                className={styles.tableScroll}
                role="region"
                aria-label="Sample accounts payable"
                tabIndex={0}
              >
                <table className={styles.payables}>
                  <thead>
                    <tr>
                      <th>Supplier</th>
                      <th>Amount</th>
                      <th>Due date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fixture.payables.map((row) => (
                      <tr key={row.supplier}>
                        <th scope="row">{row.supplier}</th>
                        <td className={styles.money}>{row.amount}</td>
                        <td className={styles.muted}>{row.due}</td>
                        <td className={tone(row.status)}>{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
          <div className={styles.column}>
            <section className={styles.panel} aria-labelledby="receivables-title">
              <div className={styles.receivablesHead}>
                <h2 id="receivables-title">Accounts receivable</h2>
                <div>
                  <h3>Total Outstanding: £12,400</h3>
                  <span className={styles.overdue}>Overdue: £3,200</span>
                </div>
              </div>
              <div
                className={styles.tableScroll}
                role="region"
                aria-label="Sample accounts receivable"
                tabIndex={0}
              >
                <table className={styles.receivables}>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Amount</th>
                      <th>Days</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fixture.invoices.map((row) => (
                      <tr key={row.id}>
                        <th scope="row">
                          {row.client}
                          <small>{row.id}</small>
                        </th>
                        <td className={styles.money}>{row.amount}</td>
                        <td className={`${styles.money} ${styles.muted}`}>{row.days}</td>
                        <td>
                          <span
                            className={row.status === "Overdue" ? styles.overdue : styles.muted}
                          >
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className={styles.panel} aria-labelledby="ratios-title">
              <h2 id="ratios-title">Quick ratios &amp; metrics</h2>
              <dl className={styles.ratios}>
                {fixture.ratios.map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>
                      <span className={styles.money}>{row.value}</span>
                      <span className={styles.success}>{row.status}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        </div>
        <details className={styles.samples}>
          <summary>Sample records &amp; source notes</summary>
          <p>
            All figures on this screen are deterministic sample data, not live GS Appliance
            financial figures. Read-only examples are never saved. Period is fixed to{" "}
            {fixture.period}. No bank connection or reconciliation is running.
          </p>
          <p>
            Reference: Figma 10:3179 · fixture {fixture.id}. The source payable rows total £6,800
            and receivables total £12,400. The source chart supplies visual heights only; it has no
            numeric scale. Ratios and summary metrics are reference examples, not calculated from a
            complete ledger.
          </p>
          <p>The following examples are independent of the reference totals.</p>
          <h2>Sample transactions</h2>
          <ul>
            {fixture.transactions.map((row) => (
              <li key={row.id}>
                {row.id} · {row.date} · {row.description} · {row.amount} · {row.status}
              </li>
            ))}
          </ul>
          <h2>Sample quotes</h2>
          <ul>
            {fixture.quotes.map((row) => (
              <li key={row.id}>
                {row.id} · {row.client} · {row.amount} · {row.status}
              </li>
            ))}
          </ul>
          <h2>Sample budgets</h2>
          <ul>
            {fixture.budgets.map((row) => (
              <li key={row.category}>
                {row.category} · Planned {row.planned} · Actual {row.actual}
              </li>
            ))}
          </ul>
          <h2>Sample reconciliation</h2>
          <p>
            {fixture.reconciliation.matched} matched · {fixture.reconciliation.unmatched} unmatched
            · {fixture.reconciliation.status}
          </p>
        </details>
      </div>
    </div>
  );
}
