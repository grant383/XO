import { z } from "zod";
import {
  billingCommand,
  BillingConflictError,
  BillingPermissionError,
  BillingUnavailableError,
  getBillingOverview,
  listBillingAccounts,
  startBillingCommand,
} from "@/modules/billing";
import { accountApi, HttpError, readJson } from "../../_shared/account";
export async function GET(request: Request) {
  return accountApi(request, async (actor) => {
    const accountId = new URL(request.url).searchParams.get("accountId");
    if (!accountId) return { accounts: await listBillingAccounts(actor) };
    if (!z.uuid().safeParse(accountId).success)
      throw new HttpError(400, "VALIDATION", "Invalid account identifier");
    try {
      return await getBillingOverview(actor, accountId);
    } catch (e) {
      if (e instanceof BillingPermissionError)
        throw new HttpError(403, "FORBIDDEN", "Billing account ownership is required");
      throw e;
    }
  });
}
export async function POST(request: Request) {
  return accountApi(request, async (actor) => {
    const parsed = billingCommand.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(400, "VALIDATION", "Invalid billing command");
    try {
      return await startBillingCommand(actor, parsed.data);
    } catch (e) {
      if (e instanceof BillingPermissionError)
        throw new HttpError(403, "FORBIDDEN", "Billing account ownership is required");
      if (e instanceof BillingConflictError) throw new HttpError(409, "CONFLICT", e.message);
      if (e instanceof BillingUnavailableError) throw new HttpError(503, "UNAVAILABLE", e.message);
      throw e;
    }
  });
}
