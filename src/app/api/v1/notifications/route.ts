import { z } from "zod";
import {
  getInbox,
  getVentureActivity,
  inboxQuery,
  markNotificationsRead,
  readInput,
} from "@/modules/notifications";
import {
  VentureNotFoundError,
  VenturePermissionError,
  VentureStateError,
} from "@/modules/ventures";
import { accountApi, HttpError, readJson } from "../../_shared/account";
export async function GET(request: Request) {
  return accountApi(request, async (actor) => {
    const params = new URL(request.url).searchParams;
    if (params.has("ventureId")) {
      const id = z.uuid().safeParse(params.get("ventureId"));
      if (!id.success) throw new HttpError(400, "VALIDATION", "Invalid venture identifier");
      try {
        return { items: await getVentureActivity(actor, id.data) };
      } catch (e) {
        if (
          e instanceof VentureNotFoundError ||
          e instanceof VenturePermissionError ||
          e instanceof VentureStateError
        )
          throw new HttpError(403, "FORBIDDEN", "Activity is not available");
        throw e;
      }
    }
    const parsed = inboxQuery.safeParse({
      unread: params.get("unread") === "1",
      ...(params.has("at") || params.has("id")
        ? { cursor: { at: params.get("at"), id: params.get("id") } }
        : {}),
    });
    if (!parsed.success) throw new HttpError(400, "VALIDATION", "Invalid inbox query");
    return getInbox(actor, parsed.data);
  });
}
export async function POST(request: Request) {
  return accountApi(request, async (actor) => {
    const parsed = readInput.safeParse(await readJson(request));
    if (!parsed.success || new Date(parsed.data.through).getTime() > Date.now() + 1000)
      throw new HttpError(400, "VALIDATION", "Invalid notification update");
    return markNotificationsRead(actor, parsed.data);
  });
}
