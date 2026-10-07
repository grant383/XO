import { z } from "zod";
export const billingCommand = z
  .object({ accountId: z.uuid(), requestId: z.uuid(), action: z.enum(["checkout", "portal"]) })
  .strict();
