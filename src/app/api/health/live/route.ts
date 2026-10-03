export const dynamic = "force-dynamic";

/** Liveness: the process is serving requests. No dependency checks. */
export function GET() {
  return Response.json({ status: "ok" });
}
