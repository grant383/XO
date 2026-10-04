/** Loading state while membership and team data are resolved server-side. */
export default function TeamLoading() {
  return (
    <main style={{ maxWidth: 960, margin: "48px auto", padding: "0 16px" }}>
      <p role="status" aria-live="polite">
        Loading team…
      </p>
    </main>
  );
}
