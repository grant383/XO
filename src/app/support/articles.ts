export const articles = [
  {
    id: "getting-started",
    title: "Getting started",
    summary: "Set up your venture and complete onboarding",
    icon: "rocket",
    body: "Choose Create venture from the venture switcher. Enter the business name, sector, reporting currency, timezone and financial year. Review your details before creating the workspace. You can resume an owned draft from the home page.",
  },
  {
    id: "data-sources",
    title: "Connect data sources",
    summary: "Understand data connection availability",
    icon: "plugzap",
    body: "Companies House lookup is available during business setup when configured. Accounting, payment, CRM and calendar integrations arrive with Operate. The onboarding connections step reports availability; continuing does not claim that a provider is connected.",
  },
  {
    id: "growth",
    title: "Build a growth plan",
    summary: "Targets, assumptions, and weekly actions",
    icon: "trendingup",
    body: "Growth planning is coming with Command and Build. Revenue targets, actual performance and forecasts will remain distinct. Release 1 forecasts use explicit formulas and assumptions; they do not depend on trained machine-learning models.",
  },
  {
    id: "team",
    title: "Manage your team",
    summary: "Roles, permissions, and secure access",
    icon: "users",
    body: "Open Team & Permissions within the venture. Owners may invite Admins, Managers, Operators and Viewers; Admins may manage Managers, Operators and Viewers. Invitation acceptance requires signing in with the invited verified email. Suspended and removed memberships cannot access venture data.",
  },
  {
    id: "billing",
    title: "Billing & invoices",
    summary: "Plans, payment methods, and subscription access",
    icon: "creditcard",
    body: "A billable account is separate from venture ownership and may entitle multiple ventures. Subscription billing setup is still being completed. Contact support with billing questions; do not include card numbers or payment credentials in requests.",
  },
  {
    id: "security",
    title: "Security & privacy",
    summary: "MFA, sessions, encryption, and data controls",
    icon: "shieldcheck",
    body: "Open Profile & Security to change your password, set up an authenticator, regenerate backup codes, or sign out other devices. Backup codes are single-use. Changing or resetting your password revokes existing sessions. Venture access is checked on every protected request and independently by PostgreSQL RLS.",
  },
] as const;
