import { commandQuery, getCommandCentre } from "@/modules/command";
import {
  VentureNotFoundError,
  VenturePermissionError,
  VentureStateError,
} from "@/modules/ventures";
import { accountApi, HttpError } from "../../_shared/account";

/**
 * Command Centre snapshot (matrix row 16: `GET /api/v1/command`). Viewer+ of an active
 * venture, resolved from the database on every request; unknown and inaccessible ventures
 * return the same 403 (no enumeration). Task changes stay Server Actions (ADR-0024).
 */
export async function GET(request: Request) {
  return accountApi(request, async (actor) => {
    const params = new URL(request.url).searchParams;
    const parsed = commandQuery.safeParse({ ventureId: params.get("ventureId") ?? undefined });
    if (!parsed.success) throw new HttpError(400, "VALIDATION", "Invalid venture identifier");
    try {
      // Dates serialise as UTC ISO 8601. `asOf` is freshness; each metric states its source.
      return await getCommandCentre(actor, parsed.data.ventureId);
    } catch (e) {
      if (
        e instanceof VentureNotFoundError ||
        e instanceof VenturePermissionError ||
        e instanceof VentureStateError
      )
        throw new HttpError(403, "FORBIDDEN", "Command Centre is not available");
      throw e;
    }
  });
}
