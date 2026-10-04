import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  Alert,
  Avatar,
  Button,
  Checkbox,
  EmptyState,
  ErrorState,
  AccessComparison,
  Icon,
  initialsOf,
  LoadingState,
  SelectField,
  StatusBadge,
  TextField,
} from "@/ui";

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

describe("SelectField", () => {
  const options = [
    { value: "GBP", label: "GBP — Pound sterling" },
    { value: "EUR", label: "EUR — Euro" },
  ];

  it("labels a native select, adds the placeholder option and links errors", () => {
    const out = html(
      <SelectField
        name="currency"
        label="Reporting currency"
        options={options}
        placeholder="Choose a currency"
        error="Choose a currency."
      />,
    );
    expect(out).toContain('<label for="currency"');
    expect(out).toMatch(/<select[^>]*id="currency"[^>]*name="currency"/);
    expect(out).toContain('<option value="">Choose a currency</option>');
    expect(out).toContain('aria-invalid="true"');
    expect(out).toContain('aria-describedby="currency-error"');
  });

  it("has no empty option without a placeholder", () => {
    expect(html(<SelectField name="tz" label="Timezone" options={options} />)).not.toContain(
      'value=""',
    );
  });
});

describe("Avatar", () => {
  it("derives up to two initials", () => {
    expect(initialsOf("Sarah Mitchell")).toBe("SM");
    expect(initialsOf("  ada   lovelace byron ")).toBe("AB");
    expect(initialsOf("Cher")).toBe("CH");
    expect(initialsOf("")).toBe("?");
  });

  it("is decorative: hidden from assistive technology", () => {
    expect(html(<Avatar name="Sarah Mitchell" />)).toContain('aria-hidden="true"');
  });
});

describe("EmptyState and LoadingState", () => {
  it("renders the empty state heading at the requested level with its action", () => {
    const out = html(
      <EmptyState
        as="h1"
        title="Nothing here yet"
        description="Add a record."
        action={<a href="/x">Go</a>}
      />,
    );
    expect(out).toContain("<h1");
    expect(out).toContain("Nothing here yet");
    expect(out).toContain('href="/x"');
    expect(out).not.toContain('role="status"');
  });

  it("announces loading politely", () => {
    const out = html(<LoadingState title="Loading" status="Loading…" />);
    expect(out).toContain('role="status"');
    expect(out).toContain('aria-live="polite"');
  });
});

describe("ErrorState", () => {
  it("states the error in text: code, heading and the access gap", () => {
    const out = html(
      <ErrorState
        tone="danger"
        icon="shield-x"
        code="Error 403 · Permission required"
        title="No access"
        description="Ask an Owner."
        detail={<AccessComparison required="Owner or Admin" current="Viewer" />}
      />,
    );
    expect(out).toContain("Error 403 · Permission required");
    expect(out).toMatch(/<h1[^>]*>No access<\/h1>/);
    expect(out).toContain("Required access");
    expect(out).toContain("Viewer");
  });
});
