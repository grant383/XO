/** Deterministic presentation samples; never persisted or treated as venture actuals. */
export const FINANCE_FIXTURE = {
  id: "figma-10-3179-v1",
  period: "August 2026",
  currency: "GBP",
  metrics: [
    { label: "Cash Balance", value: "£34,200", status: "Healthy" },
    { label: "Revenue MTD", value: "£28,400" },
    { label: "Expenses MTD", value: "£19,800" },
    { label: "Net Position", value: "+£8,600", status: "Positive" },
  ],
  // Source chart gives geometry only; these are pixel heights, not financial amounts.
  cashChart: [
    { month: "Mar", cashInHeight: 65, cashOutHeight: 40, balanceY: 70 },
    { month: "Apr", cashInHeight: 72, cashOutHeight: 48, balanceY: 82 },
    { month: "May", cashInHeight: 85, cashOutHeight: 55, balanceY: 55 },
    { month: "Jun", cashInHeight: 90, cashOutHeight: 60, balanceY: 48 },
    { month: "Jul", cashInHeight: 95, cashOutHeight: 62, balanceY: 35 },
    { month: "Aug MTD", cashInHeight: 48, cashOutHeight: 30, balanceY: 22 },
  ],
  payables: [
    {
      supplier: "Fuel Card Services Ltd",
      amount: "£1,450",
      due: "14 Aug 2026",
      status: "Approved",
    },
    {
      supplier: "ProField Software SaaS",
      amount: "£1,200",
      due: "18 Aug 2026",
      status: "Approved",
    },
    {
      supplier: "HMRC Corp Tax Installment",
      amount: "£3,500",
      due: "21 Aug 2026",
      status: "Pending",
    },
    { supplier: "TradePoint Supplier Ltd", amount: "£650", due: "25 Aug 2026", status: "Draft" },
  ],
  invoices: [
    {
      client: "Oakwood Estates",
      id: "INV-2026-042",
      amount: "£3,200",
      days: 34,
      status: "Overdue",
    },
    {
      client: "Highland Retail",
      id: "INV-2026-048",
      amount: "£4,500",
      days: 18,
      status: "Outstanding",
    },
    {
      client: "Apex Dev Group",
      id: "INV-2026-050",
      amount: "£2,100",
      days: 12,
      status: "Outstanding",
    },
    {
      client: "Beacon Logistics",
      id: "INV-2026-051",
      amount: "£1,800",
      days: 5,
      status: "Outstanding",
    },
    {
      client: "Summit Ventures",
      id: "INV-2026-053",
      amount: "£800",
      days: 2,
      status: "Outstanding",
    },
  ],
  ratios: [
    { label: "Current Ratio", value: "2.1x", status: "Optimal" },
    { label: "Quick Ratio", value: "1.8x", status: "Optimal" },
    { label: "Debt-to-Equity", value: "0.3x", status: "Healthy" },
    { label: "Burn Rate", value: "£4,200/mo", status: "Secure" },
  ],
  // Supplemental samples are independent examples, not a ledger behind the Figma totals.
  transactions: [
    {
      id: "SAMPLE-TXN-001",
      date: "2026-08-12",
      description: "Example customer receipt",
      amount: "£1,280",
      status: "Matched",
    },
    {
      id: "SAMPLE-TXN-002",
      date: "2026-08-13",
      description: "Example materials payment",
      amount: "−£420",
      status: "Unmatched",
    },
  ],
  quotes: [{ id: "SAMPLE-Q-001", client: "Example customer", amount: "£2,400", status: "Draft" }],
  budgets: [{ category: "Example materials budget", planned: "£5,000", actual: "£4,200" }],
  reconciliation: { matched: 1, unmatched: 1, status: "Sample review pending" },
} as const;
