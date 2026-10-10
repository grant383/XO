import { sampleWeeks, type SampleWeek } from "./fixtures";
import { ScheduleBoard } from "./schedule-board";
import styles from "./schedule.module.css";

export function ScheduleScreen({
  weeks = sampleWeeks,
  initialWeek,
}: {
  weeks?: Readonly<Record<string, SampleWeek>>;
  initialWeek?: string;
}) {
  return (
    <div className={styles.screen}>
      <ScheduleBoard weeks={weeks} initialWeek={initialWeek} />
      <details className={styles.notes}>
        <summary>Sample schedule &amp; source notes</summary>
        <p>
          Fixed Figma 14:438 fixtures, not live GS Appliance jobs, rosters or calendar events. No
          job, scheduling or Google Calendar source is connected. The week switcher moves through
          weeks in your browser, and only the week of 31 Aug 2026 has sample bookings. Nothing is
          fetched, assigned or saved, and alerts create no tasks.
        </p>
        <p>
          The reference labels this week “Week of 1 Sep 2026” with Monday as 1 Sep, but 1 Sep 2026
          is a Tuesday, so the days are shown as Mon 31 Aug to Fri 4 Sep. The reference figures are
          design samples and are not internally consistent: the calendar shows 21 job bookings
          (excluding internal time) against 32 jobs this week and one unassigned job against 3, and
          the heatmap marks Tom as over capacity on Wednesday although the calendar shows one
          booking that day.
        </p>
      </details>
    </div>
  );
}
