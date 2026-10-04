/**
 * Identity module: authentication, sessions and the profile identity foundation.
 * Better Auth provides identity/session primitives only; venture membership and RBAC
 * live in DirectorXO domain modules (ADR-0009).
 */
export {
  getAuth,
  getSession,
  hasSessionCookie,
  requireSession,
  setAuthForTests,
  UnauthenticatedError,
  type AuthenticatedSession,
} from "./service";
export { createIdentityAuth, type IdentityAuth, type IdentityConfig } from "./auth";
export {
  changePassword,
  confirmMfaEnrolment,
  disableMfa,
  getMfaStatus,
  getPasswordChangedAt,
  getProfile,
  hasMfaChallenge,
  listSessions,
  login,
  logout,
  regenerateRecoveryCodes,
  register,
  requestPasswordReset,
  resendVerificationEmail,
  resetPassword,
  revokeOtherSessions,
  revokeSession,
  startMfaEnrolment,
  updateName,
  verifyEmail,
  verifyMfaChallenge,
  type FlowErrorCode,
  type FlowResult,
  type MfaEnrolment,
  type MfaStatus,
  type Profile,
  type SessionSummary,
} from "./flows";
export { AuthEvents } from "./audit";
export { settleBackgroundTasks } from "./background";
export { CORRELATION_HEADER } from "./request-meta";
export { scrubText, scrubValue } from "./log-scrub";
export { safeNextPath, withNext } from "./redirects";
export {
  AUTH_BASE_PATH,
  COOKIE_PREFIX,
  LOGIN_FAILURE_LIMIT,
  MFA_POLICY,
  PASSWORD_POLICY,
  RATE_LIMITS,
  SESSION_POLICY,
  TOKEN_POLICY,
} from "./policy";
