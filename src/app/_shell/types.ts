/** Data the server passes to the client shell. Labels only: no authority lives here. */
export type ShellVenture = {
  id: string;
  name: string;
  roleLabel: string;
  operationsAllowed?: boolean;
};
export type ShellUser = { name: string; email: string };
export type ShellNavItem = { href: string; label: string; exact?: boolean };
export type ShellNavSection = { label: string; items: ShellNavItem[] };
/** Account-level pages (`/settings/*`) have no venture in context. */
export const ACCOUNT_CONTEXT = "Account";
