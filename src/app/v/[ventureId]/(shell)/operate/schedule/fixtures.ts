/**
 * Figma 14:438 reference fixtures. These are design samples, not live GS Appliance jobs,
 * team rosters or calendar events; no scheduling source or Google Calendar is connected.
 */

/** Booking colours in the reference: blue, green, amber and grey. */
export type BookingKind = "project" | "service" | "flagged" | "internal";
export const BOOKING_KINDS: readonly (readonly [BookingKind, string])[] = [
  ["project", "Project"],
  ["service", "Service visit"],
  ["flagged", "Flagged"],
  ["internal", "Internal"],
];

/** One cell per weekday, Monday to Friday. */
export type WeekBookings = readonly [
  readonly Booking[],
  readonly Booking[],
  readonly Booking[],
  readonly Booking[],
  readonly Booking[],
];
export type Booking = { readonly label: string; readonly kind: BookingKind };
export type SampleMember = { readonly name: string; readonly days: WeekBookings };

export type CapacityLevel = "full" | "part" | "over" | "free";
export const CAPACITY_LEVELS: readonly (readonly [CapacityLevel, string])[] = [
  ["full", "Full"],
  ["part", "Part"],
  ["over", "Over"],
];
export type SampleCapacity = {
  readonly name: string;
  /** Weekly utilisation in percent; null where the role is not tracked (shown as N/A). */
  readonly utilisation: number | null;
  readonly days: readonly [
    CapacityLevel,
    CapacityLevel,
    CapacityLevel,
    CapacityLevel,
    CapacityLevel,
  ];
};

export type AlertSeverity = "high" | "warn" | "low";
export type SampleAlert = { readonly severity: AlertSeverity; readonly message: string };

export type SampleWeek = {
  readonly metrics: readonly (readonly [label: string, value: string, tone?: "amber"])[];
  readonly members: readonly SampleMember[];
  readonly capacity: readonly SampleCapacity[];
  readonly alerts: readonly SampleAlert[];
};

/** Monday of the reference week. Figma labels it "Week of 1 Sep 2026" (see verification). */
export const SAMPLE_WEEK_START = "2026-08-31";

const p = (label: string): Booking => ({ label, kind: "project" });
const s = (label: string): Booking => ({ label, kind: "service" });
const f = (label: string): Booking => ({ label, kind: "flagged" });
const i = (label: string): Booking => ({ label, kind: "internal" });

export const sampleWeek: SampleWeek = {
  metrics: [
    ["Jobs this week", "32"],
    ["Capacity used", "78%"],
    ["Unassigned", "3", "amber"],
    ["Revenue booked", "£14,200"],
  ],
  members: [
    {
      name: "James Cooper",
      days: [
        [p("Oakwood Est bathroom")],
        [s("Highland Retail (AM)")],
        [s("Summit Ventures (AM)")],
        [p("St Mary School")],
        [s("Greenfield Clinic (AM)"), f("UNASSIGNED Job")],
      ],
    },
    {
      name: "Marcus Brown",
      days: [
        [s("Mrs Patterson boiler"), s("Mr Ahmed emergency")],
        [s("Gas certs x3")],
        [s("Mr Singh"), s("Mrs Chen")],
        [s("Power flush (AM)")],
        [s("Emergency cover")],
      ],
    },
    {
      name: "Tom Richards",
      days: [
        [p("with James (Oakwood)")],
        [f("Training")],
        [p("Beacon Logistics")],
        [p("Oakwood Est (full day)")],
        [p("Oakwood Est final")],
      ],
    },
    {
      name: "David Okafor",
      days: [
        [s("Apex Dev heating")],
        [s("Apex Dev cont.")],
        [],
        [s("EV charger consult (AM)")],
        [],
      ],
    },
    {
      name: "Lisa Chen",
      days: [[i("Office")], [i("Marketing")], [i("Office")], [i("Client visits")], [i("Office")]],
    },
  ],
  capacity: [
    { name: "James Cooper", utilisation: 95, days: ["full", "full", "full", "full", "full"] },
    { name: "Marcus Brown", utilisation: 88, days: ["full", "full", "full", "part", "full"] },
    { name: "Tom Richards", utilisation: 82, days: ["full", "part", "over", "full", "full"] },
    { name: "David Okafor", utilisation: 65, days: ["full", "full", "free", "part", "free"] },
    { name: "Lisa Chen", utilisation: null, days: ["free", "free", "free", "free", "free"] },
  ],
  alerts: [
    { severity: "high", message: "Friday PM unassigned — Greenfield follow-up" },
    { severity: "warn", message: "Tom double-booked Wed/Thu — resolve conflict" },
    { severity: "low", message: "David underutilised this week — assign more" },
  ],
};

/** Only the reference week has sample data; every other week is empty. */
export const sampleWeeks: Readonly<Record<string, SampleWeek>> = {
  [SAMPLE_WEEK_START]: sampleWeek,
};
