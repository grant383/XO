import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EmailDeliveryError,
  MemoryTransport,
  parseAddress,
  SendGridTransport,
} from "@/platform/email";

const message = {
  to: "founder@example.test",
  subject: "Verify your email",
  text: "Open https://app.test/auth/verify-email?token=secret-token-value",
  html: "<a href='https://app.test/auth/verify-email?token=secret-token-value'>Verify</a>",
  category: "auth.verify-email",
};
const API_KEY = "SG.test-api-key-0123456789abcdef";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("parseAddress", () => {
  it("parses display-name addresses and bare addresses", () => {
    expect(parseAddress("DirectorXO <no-reply@directorxo.com>")).toEqual({
      name: "DirectorXO",
      email: "no-reply@directorxo.com",
    });
    expect(parseAddress('"Director XO" <a@b.test>')).toEqual({
      name: "Director XO",
      email: "a@b.test",
    });
    expect(parseAddress("a@b.test")).toEqual({ email: "a@b.test" });
  });
});

describe("SendGridTransport", () => {
  it("posts a v3 payload with tracking disabled so token links are never rewritten", async () => {
    const fetchMock = vi.fn(
      async () => new Response(null, { status: 202, headers: { "x-message-id": "sg-1" } }),
    );
    const t = new SendGridTransport(API_KEY, fetchMock as unknown as typeof fetch);
    const result = await t.send(message, { email: "no-reply@directorxo.com", name: "DirectorXO" });

    expect(result.providerMessageId).toBe("sg-1");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.sendgrid.com/v3/mail/send");
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${API_KEY}`);
    const body = JSON.parse(String(init.body));
    expect(body.personalizations).toEqual([{ to: [{ email: message.to }] }]);
    expect(body.categories).toEqual(["auth.verify-email"]);
    expect(body.tracking_settings.click_tracking.enable).toBe(false);
    expect(body.tracking_settings.open_tracking.enable).toBe(false);
  });

  it("raises a content-free error on a non-202 response", async () => {
    const fetchMock = vi.fn(async () => new Response('{"errors":[]}', { status: 401 }));
    const t = new SendGridTransport(API_KEY, fetchMock as unknown as typeof fetch);
    const error = await t.send(message, { email: "x@y.test" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmailDeliveryError);
    const text = `${(error as Error).message} ${JSON.stringify(error)}`;
    expect(text).toContain("401");
    expect(text).not.toContain(API_KEY);
    expect(text).not.toContain("secret-token-value");
    expect(text).not.toContain(message.to);
  });

  it("raises a content-free error on network failure", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error(`connect failed for ${API_KEY}`);
    });
    const t = new SendGridTransport(API_KEY, fetchMock as unknown as typeof fetch);
    const error = await t.send(message, { email: "x@y.test" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmailDeliveryError);
    expect((error as Error).message).not.toContain(API_KEY);
  });
});

describe("MemoryTransport", () => {
  it("captures messages", async () => {
    const t = new MemoryTransport();
    await t.send(message, { email: "from@x.test" });
    expect(t.outbox).toHaveLength(1);
    expect(t.outbox[0]).toMatchObject({ to: message.to, category: "auth.verify-email" });
  });
});

describe("email environment", () => {
  it("requires SendGrid in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EMAIL_PROVIDER", "smtp");
    vi.stubEnv("SMTP_URL", "smtp://localhost:1025");
    vi.stubEnv("EMAIL_FROM", "DirectorXO <no-reply@directorxo.com>");
    const { emailEnv } = await import("@/platform/config/env");
    expect(() => emailEnv()).toThrow(/EMAIL_PROVIDER/);
  });

  it("refuses the memory transport in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EMAIL_PROVIDER", "memory");
    vi.stubEnv("EMAIL_FROM", "DirectorXO <no-reply@directorxo.com>");
    const { emailEnv } = await import("@/platform/config/env");
    expect(() => emailEnv()).toThrow(/EMAIL_PROVIDER/);
  });

  it("does not echo the SendGrid key when validation fails", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "sendgrid");
    vi.stubEnv("SENDGRID_API_KEY", "short-secret");
    vi.stubEnv("EMAIL_FROM", "");
    const { emailEnv } = await import("@/platform/config/env");
    expect(() => emailEnv()).toThrow(/SENDGRID_API_KEY/);
    expect(() => emailEnv()).not.toThrow(/short-secret/);
  });
});
