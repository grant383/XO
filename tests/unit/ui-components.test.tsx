import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Alert, Button, Checkbox, Icon, StatusBadge, TextField } from "@/ui";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("TextField", () => {
  it("labels the input and links hint and error via aria-describedby", () => {
    const out = html(
      <TextField
        name="email"
        label="Work email"
        type="email"
        hint="We never share it."
        error="Enter a valid email."
      />,
    );
    expect(out).toContain('<label for="email"');
    expect(out).toMatch(/<input[^>]*id="email"[^>]*name="email"/);
    expect(out).toContain('aria-invalid="true"');
    expect(out).toContain('aria-describedby="email-hint email-error"');
    expect(out).toContain('id="email-error"');
  });

  it("omits aria-invalid and aria-describedby when there is nothing to describe", () => {
    const out = html(<TextField name="name" label="Name" />);
    expect(out).not.toContain("aria-invalid");
    expect(out).not.toContain("aria-describedby");
  });

  it("renders password fields with a labelled, toggleable reveal control", () => {
    const out = html(
      <TextField
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
      />,
    );
    expect(out).toMatch(/<input[^>]*type="password"/);
    expect(out).toContain('aria-label="Show password"');
    expect(out).toContain('aria-pressed="false"');
    expect(out).toContain('aria-controls="password"');
  });
});

describe("Button", () => {
  it("defaults to type=button so it never submits by accident", () => {
    expect(html(<Button>Go</Button>)).toContain('type="button"');
  });

  it("is busy, disabled and keeps a label while loading", () => {
    const out = html(
      <Button type="submit" loading loadingLabel="Signing in…">
        Sign in
      </Button>,
    );
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain("disabled");
    expect(out).toContain("Signing in…");
  });
});

describe("Alert", () => {
  it("announces errors assertively and other tones politely", () => {
    expect(html(<Alert tone="error" title="Sign-in failed" />)).toContain('role="alert"');
    expect(html(<Alert tone="success" title="Saved" />)).toContain('role="status"');
  });

  it("states the tone in text, not colour alone", () => {
    expect(
      html(
        <Alert tone="warning" title="Capacity at risk">
          Three jobs exceed the plan.
        </Alert>,
      ),
    ).toContain("Capacity at risk");
  });
});

describe("decorative assets", () => {
  it("icons are hidden from assistive tech and use the Figma asset size", () => {
    const out = html(<Icon name="shield-check" />);
    expect(out).toContain('alt=""');
    expect(out).toContain('aria-hidden="true"');
    expect(out).toContain("/ui/icons/shield-check.svg");
    expect(out).toContain('width="14"');
  });

  it("status badges carry a text label", () => {
    expect(html(<StatusBadge tone="success">Secure session</StatusBadge>)).toContain(
      "Secure session",
    );
  });

  it("checkboxes are wrapped in their label", () => {
    expect(html(<Checkbox name="agree" label="I agree" />)).toMatch(
      /<label[^>]*><input[^>]*type="checkbox"[^>]*\/>I agree<\/label>/,
    );
  });
});
