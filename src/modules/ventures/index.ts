/**
 * Ventures module: venture creation, lifecycle, access resolution (venture switching
 * foundation), onboarding and the canonical RBAC policy (`rbac.ts`). Venture membership and
 * RBAC are DirectorXO-owned (ADR-0007, ADR-0013);
 * PostgreSQL RLS independently enforces every read and write here.
 */
export {
  listDraftVentures,
  listMyVentures,
  listSwitchableVentures,
  resolveSelectedVenture,
  resolveVenture,
  type Actor,
  type VentureAccess,
  type VentureRole,
  type VentureStatus,
  type VentureSummary,
} from "./access";
export {
  completeDataConnections,
  completeOnboarding,
  createDraftVenture,
  getDataConnectionsStatus,
  getOnboarding,
  listDraftOnboarding,
  lookupCompany,
  saveBusinessDetails,
  type ActionResult,
  type CompanyLookupResult,
  type CompanyVerificationStatus,
  type DataConnectionsStatus,
  type DraftOnboarding,
  type OnboardingStep,
  type OnboardingView,
} from "./onboarding";
export { VentureNotFoundError, VenturePermissionError, VentureStateError } from "./errors";
export {
  assignableRoles,
  can,
  canChangeMember,
  canManageRole,
  capabilitiesOf,
  CAPABILITIES,
  isVentureRole,
  ROLE_LABELS,
  rolesWith,
  VENTURE_ROLES,
  type Capability,
} from "./rbac";
export {
  businessDetailsInput,
  COMMON_CURRENCIES,
  CURRENCIES,
  MONTHS,
  SECTORS,
  TIMEZONES,
  type BusinessDetailsInput,
} from "./policy";
export { companyRegistry, setCompanyRegistryForTests } from "./registry";
