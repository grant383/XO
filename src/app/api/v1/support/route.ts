import { createSupportRequest, listSupportRequests } from "@/modules/support";
import { supportCursor } from "@/modules/support";
import { accountApi, HttpError, readJson } from "../../_shared/account";

export async function GET(request: Request) {
  return accountApi(request, async (actor) => {
    const params = new URL(request.url).searchParams;
    let cursor;
    if (params.has("at") || params.has("id")) {
      const parsed = supportCursor.safeParse({ at: params.get("at"), id: params.get("id") });
      if (!parsed.success) throw new HttpError(400, "VALIDATION", "Invalid cursor");
      cursor = parsed.data;
    }
    return listSupportRequests(actor, cursor);
  });
}

export async function POST(request: Request) {
  return accountApi(request, async (actor) => {
    const result = await createSupportRequest(actor, await readJson(request));
    if (!result.ok)
      throw new HttpError(
        result.code === "CONFLICT" ? 409 : result.code === "LIMIT" ? 429 : 400,
        result.code,
        result.message,
      );
    return { data: result.data };
  });
}
