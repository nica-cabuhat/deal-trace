import { z } from "zod";
import { EmailMessageSchema, EmailTagSchema, ThreadTagSchema } from "./thread.schema";

export const AnalyzeRequestSchema = z.object({
  messages: z.array(EmailMessageSchema),
});

// Groq json_object mode requires a top-level object.
// tags: one array of EmailTag[] per message (same order as input).
// threadTags: thread-level patterns derived from the conversation as a whole.
// product: the product or solution being discussed (e.g. "Sophos XDR").
// mainContact: the primary prospect contact name (e.g. "Legolas Greenleaf").
export const GroqTagsResponseSchema = z.object({
  tags: z.array(z.array(EmailTagSchema)),
  threadTags: z.array(ThreadTagSchema),
  product: z.string().optional(),
  mainContact: z.string().optional(),
});

export const AnalyzeResponseSchema = z.object({
  messages: z.array(EmailMessageSchema),
  threadTags: z.array(ThreadTagSchema),
  product: z.string().optional(),
  mainContact: z.string().optional(),
});
