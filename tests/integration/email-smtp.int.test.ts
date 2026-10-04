import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SmtpTransport } from "@/platform/email";

/**
 * SMTP adapter against Mailpit (docker-compose locally, service container in CI).
 * Verifies a real SMTP round trip, not just a mocked client.
 */
const SMTP_URL = process.env.SMTP_URL ?? "smtp://localhost:51025";
const MAILPIT_API = process.env.MAILPIT_API_URL ?? "http://localhost:58025";

describe("SmtpTransport (Mailpit)", () => {
  it("delivers a multipart message", async () => {
    const to = `smtp-${randomUUID()}@example.test`;
    const t = new SmtpTransport(SMTP_URL);
    await t.send(
      { to, subject: "Hello", text: "plain body", html: "<p>html body</p>", category: "test.smtp" },
      { email: "no-reply@directorxo.local", name: "DirectorXO" },
    );

    const res = await fetch(
      `${MAILPIT_API}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
    );
    const found = (await res.json()) as { messages: Array<{ ID: string; Subject: string }> };
    expect(found.messages).toHaveLength(1);
    expect(found.messages[0]!.Subject).toBe("Hello");

    const detail = (await (
      await fetch(`${MAILPIT_API}/api/v1/message/${found.messages[0]!.ID}`)
    ).json()) as {
      Text: string;
      HTML: string;
      From: { Address: string; Name: string };
    };
    expect(detail.Text).toContain("plain body");
    expect(detail.HTML).toContain("html body");
    expect(detail.From).toMatchObject({ Address: "no-reply@directorxo.local", Name: "DirectorXO" });
  });
});
