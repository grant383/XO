/** Escapes text for interpolation into transactional email HTML. */
export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Minimal accessible transactional email layout. `paragraphs` are trusted HTML fragments:
 * escape any user-supplied text with `escapeHtml` before passing it in.
 */
export function emailLayout(
  title: string,
  paragraphs: string[],
  action?: { label: string; url: string },
) {
  const body = paragraphs.map((p) => `<p>${p}</p>`).join("\n");
  const button = action
    ? `<p><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:12px 20px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px">${escapeHtml(action.label)}</a></p>
<p style="font-size:12px;color:#6b7280">If the button does not work, copy this link into your browser:<br>${escapeHtml(action.url)}</p>`
    : "";
  return `<!doctype html><html lang="en-GB"><body style="font-family:system-ui,sans-serif;color:#111827;max-width:560px;margin:0 auto;padding:24px">
<h1 style="font-size:20px">${escapeHtml(title)}</h1>
${body}
${button}
<p style="font-size:12px;color:#6b7280">DirectorXO</p>
</body></html>`;
}
