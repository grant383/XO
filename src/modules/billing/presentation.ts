/** Provider subscription statuses mirrored in `subscriptions.status` (migration 0012). */
export type SubscriptionStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

/** Statuses that enable linked venture entitlements (ADR-0019). */
export const ENTITLING_STATUSES: readonly SubscriptionStatus[] = ["active", "trialing"];

/** Statuses after which a new subscription may be started (ADR-0019). */
const ENDED_STATUSES: readonly SubscriptionStatus[] = ["canceled", "incomplete_expired"];

export type SubscriptionPresentation = {
  label: string;
  tone: "success" | "warning" | "danger" | "neutral";
  /** True while the subscription exists at the provider and is managed in the portal. */
  subscribed: boolean;
  /** Plain-language consequence of a non-entitling status, if any. */
  notice?: string;
};

const PRESENTATION: Record<SubscriptionStatus, Omit<SubscriptionPresentation, "subscribed">> = {
  active: { label: "Active", tone: "success" },
  trialing: { label: "Trial", tone: "success" },
  past_due: {
    label: "Past due",
    tone: "warning",
    notice:
      "Payment is overdue. Linked ventures are not enabled until payment succeeds. Update your payment method in the billing portal.",
  },
  unpaid: {
    label: "Unpaid",
    tone: "danger",
    notice:
      "Payment failed. Linked ventures are not enabled until payment succeeds. Update your payment method in the billing portal.",
  },
  incomplete: {
    label: "Incomplete",
    tone: "warning",
    notice:
      "The first payment has not completed. Linked ventures are enabled after payment is confirmed.",
  },
  paused: {
    label: "Paused",
    tone: "neutral",
    notice: "The subscription is paused. Linked ventures are not enabled while it is paused.",
  },
  canceled: {
    label: "Canceled",
    tone: "neutral",
    notice: "The subscription has ended. Start a new subscription to enable linked ventures.",
  },
  incomplete_expired: {
    label: "Expired",
    tone: "neutral",
    notice: "The first payment was not completed in time. Start a new subscription to try again.",
  },
};

/** How a mirrored, provider-confirmed subscription status is presented and acted on. */
export function presentSubscription(status: SubscriptionStatus): SubscriptionPresentation {
  return { ...PRESENTATION[status], subscribed: !ENDED_STATUSES.includes(status) };
}

/** `/ month`, `/ 3 months`. */
export function billingIntervalLabel(interval: string, count: number): string {
  return count === 1 ? `/ ${interval}` : `/ ${count} ${interval}s`;
}
