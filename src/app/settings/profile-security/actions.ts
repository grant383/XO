"use server";

import { randomUUID } from "node:crypto";
import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  changePassword,
  confirmMfaEnrolment,
  CORRELATION_HEADER,
  disableMfa,
  logout,
  regenerateRecoveryCodes,
  revokeOtherSessions,
  revokeSession,
  startMfaEnrolment,
  updateName,
  withNext,
  type FlowResult,
  type MfaEnrolment,
} from "@/modules/identity";
import { identityHeaders, requireActor } from "../../actor";
import type { SettingsState } from "./form-state";

/**
 * Profile & Security actions. Each re-resolves the session from its cookie (requireActor)
 * and calls the identity flows, which re-validate input and go through Better Auth, so
 * rate limits, password re-checks, freshness rules and audit always apply.
 */
const PATH = "/settings/profile-security";

async function requestHeaders(): Promise<Headers> {
  await requireActor(PATH);
  const h = await identityHeaders();
  if (!h.get(CORRELATION_HEADER)) h.set(CORRELATION_HEADER, randomUUID());
  return h;
}

const field = (data: FormData, name: string) => {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
};

function toState<T>(result: FlowResult<T>, message: string, data?: T): SettingsState<T> {
  if (!result.ok) {
    return {
      status: "error",
      message: result.message,
      code: result.code,
      fieldErrors: result.fieldErrors,
    };
  }
  return { status: "success", message, ...(data === undefined ? {} : { data }) };
}

export async function updateNameAction(
  _prev: SettingsState,
  data: FormData,
): Promise<SettingsState> {
  const result = await updateName({ name: field(data, "name") }, await requestHeaders());
  if (result.ok) revalidatePath(PATH);
  return toState(result, "Your name has been updated.");
}

export async function changePasswordAction(
  _prev: SettingsState,
  data: FormData,
): Promise<SettingsState> {
  if (field(data, "newPassword") !== field(data, "confirmPassword")) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: { confirmPassword: "The passwords do not match." },
    };
  }
  const result = await changePassword(
    { currentPassword: field(data, "currentPassword"), newPassword: field(data, "newPassword") },
    await requestHeaders(),
  );
  if (result.ok) revalidatePath(PATH);
  return toState(result, "Password changed. Every other device has been signed out.");
}

export async function startMfaAction(
  _prev: SettingsState<MfaEnrolment>,
  data: FormData,
): Promise<SettingsState<MfaEnrolment>> {
  const result = await startMfaEnrolment(
    { password: field(data, "password") },
    await requestHeaders(),
  );
  return toState(
    result,
    "Scan the code with your authenticator app.",
    result.ok ? result.data : undefined,
  );
}

export async function confirmMfaAction(
  _prev: SettingsState,
  data: FormData,
): Promise<SettingsState> {
  const result = await confirmMfaEnrolment({ code: field(data, "code") }, await requestHeaders());
  if (result.ok) revalidatePath(PATH);
  return toState(result, "Two-step verification is on. Other devices have been signed out.");
}

export async function disableMfaAction(
  _prev: SettingsState,
  data: FormData,
): Promise<SettingsState> {
  const result = await disableMfa({ password: field(data, "password") }, await requestHeaders());
  if (result.ok) revalidatePath(PATH);
  return toState(result, "Two-step verification is off.");
}

export async function regenerateCodesAction(
  _prev: SettingsState<{ recoveryCodes: string[] }>,
  data: FormData,
): Promise<SettingsState<{ recoveryCodes: string[] }>> {
  const result = await regenerateRecoveryCodes(
    { password: field(data, "password") },
    await requestHeaders(),
  );
  if (result.ok) revalidatePath(PATH);
  return toState(
    result,
    "New backup codes created. Your old codes no longer work.",
    result.ok ? result.data : undefined,
  );
}

export async function revokeSessionAction(
  _prev: SettingsState,
  data: FormData,
): Promise<SettingsState> {
  const result = await revokeSession(field(data, "sessionId"), await requestHeaders());
  if (result.ok) revalidatePath(PATH);
  return toState(result, "That device has been signed out.");
}

export async function revokeOtherSessionsAction(): Promise<SettingsState> {
  const result = await revokeOtherSessions(await requestHeaders());
  if (result.ok) revalidatePath(PATH);
  return toState(result, "Every other device has been signed out.");
}

/** Sensitive changes need a recent sign-in: sign out and come straight back here. */
export async function reauthenticateAction(): Promise<void> {
  await logout(await requestHeaders());
  redirect(withNext("/auth/login", PATH) as Route);
}
