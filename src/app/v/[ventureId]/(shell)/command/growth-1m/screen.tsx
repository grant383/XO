"use client";

import { useState, type ReactNode } from "react";
import { cx } from "@/ui";
import { useOnline } from "@/ui/hooks/use-online";
import type { growthGap } from "@/modules/growth-command";
import { GROWTH_FIXTURE as data } from "./fixture";
import styles from "./growth.module.css";

function Asset({ name }: { name: string }) {
  return <img src={`/ui/growth-command/${name}.svg`} alt="" />;
}

/** Exact Figma chart assets stay at their intrinsic geometry inside a scaled canvas. */
function Trajectory() {
  const [scale, setScale] = useState(1);
  return (
    <div
      className={styles.chartViewport}
      ref={(element) => {
        if (!element) return;
        const observer = new ResizeObserver(([entry]) =>
          setScale(Math.min(1, (entry?.contentRect.width ?? 696) / 696)),
        );
        observer.observe(element);
        return () => observer.disconnect();
      }}
    >
      <div
        className={styles.chart}
        style={{ transform: `scale(${scale})` }}
        role="img"
        aria-label="Sample 90-day revenue trajectory. Current £51k monthly; projected point £74.8k. Figma illustration, not a calculated venture forecast."
      >
        {[16, 60, 104, 148].map((top) => (
          <img
            key={top}
            className={styles.gridLine}
            style={{ top }}
            src="/ui/growth-command/grid.svg"
            alt=""
          />
        ))}
        <img
          className={styles.baseLine}
          src="/ui/growth-command/base.png"
          width="628"
          height="150"
          alt=""
        />
        <img className={styles.targetLine} src="/ui/growth-command/target.svg" alt="" />
        <img className={styles.projectedLine} src="/ui/growth-command/projected.svg" alt="" />
        <img className={styles.currentPoint} src="/ui/growth-command/point.svg" alt="" />
        <img className={styles.projectedPoint} src="/ui/growth-command/point.svg" alt="" />
        {["£85k", "£75k", "£65k", "£51k"].map((label, i) => (
          <span key={label} className={styles.yLabel} style={{ top: 8 + i * 44 }}>
            {label}
          </span>
        ))}
        {["NOW", "+30 DAYS", "+60 DAYS", "+90"].map((label, i) => (
          <span key={label} className={styles.xLabel} style={{ left: [50, 242, 444, 628][i] }}>
            {label}
          </span>
        ))}
        <span className={styles.projectedValue}>£74.8k</span>
      </div>
    </div>
  );
}

export function GrowthScreen({
  gap,
  children,
}: {
  gap: ReturnType<typeof growthGap>;
  children: ReactNode;
}) {
  const online = useOnline();
  const [assumptions, setAssumptions] = useState(false);
  return (
    <div className={styles.screen}>
      <div className={styles.titleBar}>
        <div>
          <div className={styles.titleRow}>
            <h1>£1M Growth Command</h1>
            <span className={styles.blueBadge}>Execution mode</span>
          </div>
          <p>Reverse-engineered weekly actions to reach £1,000,000 annual revenue</p>
        </div>
        <div className={styles.scenarios} role="group" aria-label="Sample scenario controls">
          <span className={styles.eyebrow}>Plan</span>
          <button disabled title="Scenario comparison not implemented">
            Conservative
          </button>
          <button
            className={styles.selected}
            aria-pressed="true"
            disabled
            title="Fixed Target fixture; scenario selection not implemented"
          >
            <Asset name="active" />
            Target
          </button>
          <button disabled title="Scenario comparison not implemented">
            Aggressive
          </button>
          <button className={styles.refresh} disabled aria-label="Recalculate (not implemented)">
            <Asset name="refresh" />
          </button>
        </div>
      </div>
      <div className={styles.content}>
        {!online ? (
          <p className={styles.offline} role="status">
            Offline · fixed sample remains available; venture tasks are read-only.
          </p>
        ) : null}
        <div className={styles.overview}>
          <dl className={styles.metrics} aria-label="Sample revenue metrics">
            <div className={styles.metric}>
              <dt>
                Annualised revenue <span className={styles.blue}>61.2%</span>
              </dt>
              <dd>
                £612k <small>/ £1.0m</small>
              </dd>
              <dd className={styles.progress}>
                <span />
              </dd>
            </div>
            <div className={styles.metric}>
              <dt>Revenue gap</dt>
              <dd className={styles.amber}>£388k</dd>
              <dd className={styles.metricNote}>£32.3k monthly uplift required</dd>
            </div>
            <div className={styles.metric}>
              <dt>
                Required run rate <span className={styles.blueBadge}>+63%</span>
              </dt>
              <dd>£83.3k/mo</dd>
              <dd className={styles.metricNote}>Current run rate: £51.0k/mo</dd>
            </div>
            <div className={styles.metric}>
              <dt>Forecast target date</dt>
              <dd className={styles.green}>Mar 2027</dd>
              <dd className={styles.metricNote}>17 months · target scenario</dd>
            </div>
          </dl>
          <section className={styles.recommendation} aria-labelledby="growth-path">
            <span className={styles.sparkles}>
              <Asset name="sparkles" />
            </span>
            <div className={styles.recommendationCopy}>
              <div className={styles.titleRow}>
                <h2 id="growth-path" className={cx(styles.eyebrow, styles.blue)}>
                  Fastest credible path
                </h2>
                <span className={styles.greenBadge}>Sample recommendation</span>
              </div>
              <p>
                Add one senior engineer, lift quote conversion from 33% to 41%, and reactivate 240
                past customers. This closes 82% of the gap without increasing paid media spend.
              </p>
              <div className={styles.evidence}>
                <span className={styles.green}>+£26.4k/mo</span>
                <span>Payback: 7 weeks</span>
                <span>Execution risk: Medium</span>
              </div>
            </div>
            <div className={styles.pathActions}>
              <a className={styles.primary} href="#execution-plan">
                View execution plan <Asset name="arrow" />
              </a>
              <button
                aria-expanded={assumptions}
                aria-controls="growth-assumptions"
                onClick={() => setAssumptions(!assumptions)}
              >
                View assumptions
              </button>
            </div>
          </section>
        </div>
        <section className={styles.model} aria-labelledby="growth-model">
          <div className={styles.sectionHeader}>
            <div>
              <h2 id="growth-model" className={styles.eyebrow}>
                Reverse-engineered growth model
              </h2>
              <p>Current → required target · sample inputs; editing not implemented</p>
            </div>
            <span className={styles.greenBadge}>
              <Asset name="balanced" />
              Sample model
            </span>
          </div>
          <div className={styles.modelFlow}>
            {data.inputs.map((input, i) => (
              <div className={styles.modelStep} key={input.label}>
                {i > 0 ? (
                  <span className={styles.connection}>
                    <Asset name="connection" />
                    <span>{["", "×", "×", "+", "×", "="][i]}</span>
                  </span>
                ) : null}
                <dl className={cx(styles.input, "tone" in input ? styles[input.tone] : undefined)}>
                  <dt>{input.label}</dt>
                  <dd>{input.current}</dd>
                  <dd className={styles.inputTarget}>
                    <span>Target</span>
                    <span>{input.target}</span>
                  </dd>
                </dl>
              </div>
            ))}
          </div>
        </section>
        <div className={styles.middle}>
          <section className={styles.trajectory} aria-labelledby="growth-trajectory">
            <div className={styles.sectionHeader}>
              <div>
                <h2 id="growth-trajectory" className={styles.eyebrow}>
                  90-day revenue trajectory
                </h2>
                <p>Monthly run rate · Target plan selected</p>
              </div>
              <div className={styles.legend}>
                {["Base", "Target", "Projected"].map((name) => (
                  <span key={name}>
                    <Asset name={`${name.toLowerCase()}-marker`} />
                    {name}
                  </span>
                ))}
              </div>
            </div>
            <Trajectory />
          </section>
          <section className={styles.levers} aria-labelledby="growth-levers">
            <h2 id="growth-levers" className={styles.eyebrow}>
              Prioritised growth levers
            </h2>
            <div className={styles.bottleneck}>
              <span className={styles.warningIcon}>
                <Asset name="warning" />
              </span>
              <div>
                <h3>Biggest bottleneck</h3>
                <p>Quote conversion at 33%</p>
              </div>
              <span>−8 pts</span>
            </div>
            <ol>
              {data.levers.map((lever, i) => (
                <li key={lever.title}>
                  <span className={styles.priority}>{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{lever.title}</h3>
                    <p>{lever.detail}</p>
                  </div>
                  <span className={styles.green}>{lever.impact}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <section id="execution-plan" className={styles.plan} aria-labelledby="growth-plan">
          <div className={styles.planHeader}>
            <div>
              <div className={styles.titleRow}>
                <h2 id="growth-plan" className={styles.eyebrow}>
                  This week · execution plan
                </h2>
                <span className={styles.blueBadge}>5 priorities</span>
              </div>
              <p>Complete all five to unlock an estimated £23.4k monthly run-rate uplift</p>
            </div>
            <div className={styles.planSummary}>
              <div>
                <strong>1 / 5 active</strong>
                <p>Week 41 · 5–9 Oct</p>
              </div>
              <button disabled title="Growth execution actions not implemented">
                <Asset name="plus" />
                Add action
              </button>
            </div>
          </div>
          <div
            className={styles.tableViewport}
            tabIndex={0}
            role="region"
            aria-label="Sample execution table"
          >
            <table>
              <caption className="visually-hidden">
                Fixed sample execution plan; controls not implemented
              </caption>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Action</th>
                  <th>Owner</th>
                  <th>Deadline</th>
                  <th>Expected impact</th>
                  <th>Control</th>
                </tr>
              </thead>
              <tbody>
                {data.actions.map((action, i) => (
                  <tr key={action.title}>
                    <td>
                      <span className={styles.priority}>{String(i + 1).padStart(2, "0")}</span>
                    </td>
                    <td>
                      <h3>{action.title}</h3>
                      <p>{action.detail}</p>
                    </td>
                    <td>
                      <div className={styles.owner}>
                        <span>{action.initials}</span>
                        {action.owner}
                      </div>
                    </td>
                    <td>
                      {action.deadline}
                      <p className={i === 0 ? styles.blue : undefined}>{action.status}</p>
                    </td>
                    <td className={styles.green}>{action.impact}</td>
                    <td>
                      <button
                        disabled
                        className={i === 0 ? styles.primary : undefined}
                        title="Sample action · not implemented"
                      >
                        {action.control}
                        <Asset name={i === 0 ? "continue" : "configure"} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <p className={styles.fixtureNote}>
          Sample data · fixed Figma fixture. Finance, CRM, capacity, growth execution and scenario
          persistence are not implemented. No sample row represents this venture.
        </p>
        {assumptions ? (
          <section
            id="growth-assumptions"
            className={styles.assumptions}
            aria-labelledby="assumptions-title"
          >
            <h2 id="assumptions-title">Sample assumptions and calculation</h2>
            <p>
              Fixture {data.id} · {data.currency} · as of 5 October 2026, 09:00 UTC. The Figma
              cards, recommendation, dates and chart are presentation fixtures, not calculated
              forecasts. March 2027 and “17 months” are inconsistent in the source and retained as
              sample copy.
            </p>
            <p>
              Growth gap v1 (spec §13.11): target £1,000,000 − sample annual revenue £612,000 =
              £388,000; additional customers = ceil(£388,000 / £1,280) = {gap.additionalCustomers};
              additional leads = ceil({gap.additionalCustomers} / 0.33) = {gap.additionalLeads}.
            </p>
            <p>
              Monthly revenue is annual revenue / 12. Default £1M goal means annual recognised
              revenue in the venture reporting currency; this GBP fixture uses an annualised run
              rate illustration. Revenue recognition and reporting currency integration await the
              finance layer. Lever impacts are sample estimates and must not be added to the
              canonical revenue forecast.
            </p>
            <button onClick={() => setAssumptions(false)}>Close assumptions</button>
          </section>
        ) : null}
        {children}
      </div>
    </div>
  );
}
