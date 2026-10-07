import { randomUUID } from "node:crypto";
import { GET, POST } from "@/app/api/v1/auth/[...all]/route";
import { emailOutboxCounts, setEmailTransportForTests, MemoryTransport } from "@/platform/email";
import { MemoryRateLimitStore, type RateLimitStore } from "@/platform/security";
import {
  createIdentityAuth,
  setAuthForTests,
  settleBackgroundTasks,
  AUTH_BASE_PATH,
} from "@/modules/identity";

export const APP_URL = "http://localhost:3000";
export const STRONG_PASSWORD = "correct-horse-battery-staple";

/** Installs a fresh Better Auth instance and in-memory mailbox for one test file. */
export function installTestAuth(options: { secureCookies?: boolean; store?: RateLimitStore } = {}) {
  const mailbox = new MemoryTransport();
  setEmailTransportForTests(mailbox);
  const store = options.store ?? new MemoryRateLimitStore();
  const auth = createIdentityAuth({
    appUrl: APP_URL,
    secret: process.env.AUTH_SECRET!,
    secureCookies: options.secureCookies ?? false,
    rateLimitStore: store,
  });
  setAuthForTests(auth);
  return { auth, mailbox, store };
}

export function uninstallTestAuth() {
  setAuthForTests(undefined);
  setEmailTransportForTests(undefined);
}

/**
 * Waits until deferred auth work has run and the email outbox has delivered (or
 * dead-lettered) everything queued, so tests can read the mailbox deterministically.
 */
export async function settleEmail(timeoutMs = 15_000): Promise<void> {
  await settleBackgroundTasks();
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const c = await emailOutboxCounts();
    if (!c.waiting && !c.active && !c.delayed && !c.prioritized) return;
    if (Date.now() > deadline) throw new Error(`email outbox not idle: ${JSON.stringify(c)}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

let ipCounter = 1;
/** A unique client IP per call so per-IP limits never couple unrelated tests. */
export function freshIp() {
  ipCounter += 1;
  return `198.51.${Math.floor(ipCounter / 250) % 250}.${(ipCounter % 250) + 1}`;
}

export const uniqueEmail = (label = "user") => `${label}-${randomUUID().slice(0, 12)}@example.test`;

export type ApiResponse = {
  status: number;
  body: Record<string, unknown> | null;
  text: string;
  headers: Headers;
  setCookies: string[];
};

/** Minimal cookie jar keyed by cookie name (signed values are kept verbatim). */
export class CookieJar {
  private readonly cookies = new Map<string, string>();
  absorb(setCookies: string[]) {
    for (const line of setCookies) {
      const [pair, ...attrs] = line.split(";");
      const eq = pair!.indexOf("=");
      const name = pair!.slice(0, eq).trim();
      const value = pair!.slice(eq + 1).trim();
      const expired = attrs.some((a) => /max-age=0\b/i.test(a.trim())) || value === "";
      if (expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  get(name: string) {
    return this.cookies.get(name);
  }
  set(name: string, value: string) {
    this.cookies.set(name, value);
  }
  clone() {
    const c = new CookieJar();
    for (const [k, v] of this.cookies) c.set(k, v);
    return c;
  }
}

type CallOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  query?: Record<string, string>;
  jar?: CookieJar;
  ip?: string;
  origin?: string | null;
  headers?: Record<string, string>;
};

/** Calls the real `/api/v1/auth/*` route handler, exactly as Next.js would. */
export async function api(path: string, options: CallOptions = {}): Promise<ApiResponse> {
  const method = options.method ?? (options.body === undefined ? "GET" : "POST");
  const url = new URL(`${APP_URL}${AUTH_BASE_PATH}${path}`);
  for (const [k, v] of Object.entries(options.query ?? {})) url.searchParams.set(k, v);
  const headers = new Headers(options.headers);
  // `ip: ""` simulates a request without a trustworthy client IP header.
  if (options.ip !== "") headers.set("x-forwarded-for", options.ip ?? freshIp());
  headers.set("user-agent", "vitest");
  if (options.origin !== null) headers.set("origin", options.origin ?? APP_URL);
  if (options.jar) headers.set("cookie", options.jar.header());
  if (options.body !== undefined) headers.set("content-type", "application/json");

  const request = new Request(url, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const response = method === "GET" ? await GET(request) : await POST(request);
  await settleEmail();

  const text = await response.text();
  let body: Record<string, unknown> | null = null;
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    body = null;
  }
  const setCookies = response.headers.getSetCookie();
  options.jar?.absorb(setCookies);
  return { status: response.status, body, text, headers: response.headers, setCookies };
}

/** Extracts the single-use token from the most recent email to `to` with `category`. */
export function tokenFromEmail(mailbox: MemoryTransport, to: string, category: string): string {
  const message = mailbox.outbox.filter((m) => m.to === to && m.category === category).at(-1);
  if (!message) throw new Error(`No ${category} email for ${to}`);
  const match = /[?&]token=([^\s&"'<]+)/.exec(message.text);
  if (!match) throw new Error("No token link in email");
  return decodeURIComponent(match[1]!);
}

/** Registers, verifies and signs in a user through the public API. */
export async function createVerifiedUser(mailbox: MemoryTransport, label = "user") {
  const email = uniqueEmail(label);
  const name = `Test ${label}`;
  const reg = await api("/sign-up/email", { body: { name, email, password: STRONG_PASSWORD } });
  if (reg.status !== 200) throw new Error(`sign-up failed: ${reg.status} ${reg.text}`);
  const token = tokenFromEmail(mailbox, email, "auth.verify-email");
  const verified = await api("/verify-email", { query: { token } });
  if (verified.status !== 200)
    throw new Error(`verify failed: ${verified.status} ${verified.text}`);
  const userId = (reg.body!.user as { id: string }).id;
  return { email, name, password: STRONG_PASSWORD, userId };
}

/** Signs in and returns a jar holding the session cookie. */
export async function signIn(email: string, password: string, ip?: string) {
  const jar = new CookieJar();
  const res = await api("/sign-in/email", { body: { email, password }, jar, ip });
  return { jar, res };
}

export function sessionCookieName(secure = false) {
  return `${secure ? "__Secure-" : ""}dxo.session_token`;
}
