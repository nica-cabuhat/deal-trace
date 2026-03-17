import type { z } from "zod";
import type {
  EmailSenderSchema,
  EmailTagSchema,
  EmailMessageSchema,
  ThreadTagSchema,
  EmailThreadSchema,
  ThreadListResponseSchema,
} from "@/lib/schemas/thread.schema";

export type EmailSender = z.infer<typeof EmailSenderSchema>;
export type EmailTag = z.infer<typeof EmailTagSchema>;
export type EmailMessage = z.infer<typeof EmailMessageSchema>;
export type ThreadTag = z.infer<typeof ThreadTagSchema>;
export type EmailThread = z.infer<typeof EmailThreadSchema>;
export type ThreadListResponse = z.infer<typeof ThreadListResponseSchema>;
