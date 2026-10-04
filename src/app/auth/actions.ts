"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import type { Route } from "next";
import { redirect } from "next/navigation";
import {
  CORRELATION_HEADER,
  login,
  logout,
  register,
  requestPasswordReset,
  resetPassword,
  safeNextPath,
  verifyEmail,
  type FlowResult,
} from "@/modules/identity";
import type { FormState } from "./form-state";

/** Request headers for identity flows, with a correlation id for audit and logs. */
async function requestHeaders(): Promise<Headers> {
  const h = new Headers(await headers());
  if (!h.get(CORRELATION_HEADER)) h.set(CORRELATION_HEADER, randomUUID());
  return h;
}

const field = (data: FormData, name: string) => {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
};

function toState(result: FlowResult, successMessage: string): FormState {
  if (result.ok) return { status: "success", message: successMessage };
  return { status: "error", message: result.message, fieldErrors: result.fieldErrors };
}

export async function registerAction(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await register(
    { name: field(data, "name"), email: field(data, "email"), password: field(data, "password") },
    await requestHeaders(),
    safeNextPath(field(data, "next")),
  );
  // Identical message whether or not the address already has an account.
  return toState(result, "Check your inbox for a link to verify your email address.");
}

export async function loginAction(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await login(
    { email: field(data, "email"), password: field(data, "password") },
    await requestHeaders(),
  );
  if (!result.ok) return toState(result, "");
  // Only validated same-origin paths (e.g. a pending invitation); never an external URL.
  redirect((safeNextPath(field(data, "next")) ?? "/") as Route);
}

export async function forgotPasswordAction(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await requestPasswordReset(
    { email: field(data, "email") },
    await requestHeaders(),
  );
  return toState(
    result,
    "If an account exists for that address, we have sent a link to reset your password.",
  );
}

export async function resetPasswordAction(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await resetPassword(
    { token: field(data, "token"), newPassword: field(data, "newPassword") },
    await requestHeaders(),
  );
  return toState(result, "Your password has been reset and every device has been signed out.");
}

export async function verifyEmailAction(_prev: FormState, data: FormData): Promise<FormState> {
  const result = await verifyEmail({ token: field(data, "token") }, await requestHeaders());
  return toState(result, "Your email address is verified. You can now sign in.");
}

export async function logoutAction(): Promise<void> {
  await logout(await requestHeaders());
  redirect("/auth/login");
}
