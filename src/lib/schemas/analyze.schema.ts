import { z } from "zod";
import { EmailMessageSchema, EmailTagSchema, ThreadTagSchema } from "./thread.schema";

export const AnalyzeRequestSchema = z.object({
  messages: z.array(EmailMessageSchema),
});

// Groq often returns null instead of omitting optional fields.
// These schemas coerce null → undefined and default missing direction to "neutral".
const GroqEmailTagSchema = EmailTagSchema.extend({
  direction: z.enum(["positive", "negative", "neutral"]).default("neutral"),
});

const GroqThreadTagSchema = ThreadTagSchema.extend({
  direction: z.enum(["positive", "negative", "neutral"]).default("neutral"),
  closeLikelihood: z.number().min(0).max(1).nullish().transform((v) => v ?? undefined),
});

// Groq json_object mode requires a top-level object.
// tags: one array of EmailTag[] per message (same order as input).
// threadTags: thread-level patterns derived from the conversation as a whole.
// product: the product or solution being discussed (e.g. "Sophos XDR").
// mainContact: the primary prospect contact name (e.g. "Legolas Greenleaf").
export const GroqTagsResponseSchema = z.object({
  tags: z.array(z.array(GroqEmailTagSchema)),
  threadTags: z.array(GroqThreadTagSchema),
  product: z.string().nullish().transform((v) => v ?? undefined),
  mainContact: z.string().nullish().transform((v) => v ?? undefined),
});

export const AnalyzeResponseSchema = z.object({
  messages: z.array(EmailMessageSchema),
  threadTags: z.array(ThreadTagSchema),
  product: z.string().optional(),
  mainContact: z.string().optional(),
});
