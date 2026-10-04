"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { AccessComparison, Assurance, Button, ButtonLink, ErrorState, Icon } from "@/ui";

/** Shared actions and copy for the Figma 403 / 404 / 500 states (spec §12, matrix 54–56). */

function GoBack() {
  const router = useRouter();
  return (
    <Button variant="secondary" onClick={() => router.back()}>
      <Icon name="arrow-left-button" />
      Go back
    </Button>
  );
}

function Home({ href = "/", label = "Go to DirectorXO" }: { href?: string; label?: string }) {
  return (
    <ButtonLink href={href as Route}>
      <Icon name="layout-dashboard" />
      {label}
    </ButtonLink>
  );
}

/** 404 (Figma 31:3604). Shows the requested path so a mistyped link is easy to spot. */
export function NotFoundState() {
  const pathname = usePathname();
  return (
    <ErrorState
      tone="info"
      icon="map-pinned"
      code="Error 404"
      title="This page has moved—or never existed."
      description="The link may be out of date. Your plans and business data are unchanged."
      actions={
        <>
          <Home />
          <GoBack />
        </>
      }
      footnote={
        pathname && !pathname.startsWith("/errors/") ? (
          <code className="error-path">{pathname}</code>
        ) : undefined
      }
    />
  );
}

/**
 * 403 (Figma 33:4456). `required`/`current` describe the gap when the venture context is
 * known; the generic page names neither, so nothing is disclosed.
 */
export function ForbiddenState({
  title = "You don’t have access to this page.",
  description = "Your account does not have the permission this page needs. Your business data and active work are unchanged.",
  required,
  current,
  home,
  requestAccessHref,
  as,
}: {
  title?: string;
  description?: string;
  required?: string;
  current?: string;
  home?: { href: string; label: string };
  requestAccessHref?: string;
  as?: "h1" | "h2";
}) {
  return (
    <ErrorState
      tone="danger"
      icon="shield-x"
      code="Error 403 · Permission required"
      title={title}
      description={description}
      as={as}
      detail={required ? <AccessComparison required={required} current={current} /> : undefined}
      actions={
        <>
          <Home href={home?.href} label={home?.label} />
          {requestAccessHref ? (
            <ButtonLink href={requestAccessHref} variant="secondary">
              <Icon name="send" />
              Request access
            </ButtonLink>
          ) : null}
        </>
      }
      footnote={
        requestAccessHref ? "Requests go to this venture’s administrators for review." : undefined
      }
    />
  );
}

/**
 * 500 (Figma 31:3692). Only the opaque error digest is shown: messages and stacks never
 * reach the browser (spec §22, "errors never expose sensitive data").
 */
export function ServerErrorState({
  digest,
  retry,
  as,
}: {
  digest?: string;
  retry?: () => void;
  as?: "h1" | "h2";
}) {
  return (
    <ErrorState
      tone="warning"
      icon="server-cog"
      code={digest ? `Error 500 · Reference ${digest}` : "Error 500"}
      title="We hit an issue loading this page."
      description="This is on our side. Try again in a moment."
      as={as}
      detail={
        digest ? <Assurance>The error was logged with reference {digest}.</Assurance> : undefined
      }
      actions={
        <>
          {retry ? (
            <Button onClick={retry}>
              <Icon name="refresh-cw" />
              Retry
            </Button>
          ) : null}
          {retry ? (
            <ButtonLink href="/" variant="secondary">
              Go to DirectorXO
            </ButtonLink>
          ) : (
            <Home />
          )}
        </>
      }
    />
  );
}
