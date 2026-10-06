import { z } from "zod";

export const supportInput = z
  .object({
    requestId: z.uuid(),
    subject: z.string().trim().min(1, "Enter a subject").max(200),
    description: z
      .string()
      .trim()
      .min(10, "Describe the issue in at least 10 characters")
      .max(5000),
  })
  .strict();
export const supportCursor = z.object({ at: z.iso.datetime(), id: z.uuid() }).strict();
export type SupportCursor = z.infer<typeof supportCursor>;
