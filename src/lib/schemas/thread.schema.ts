import { z } from "zod";

export const EmailSenderSchema = z.object({
  emailAddress: z.object({
    name: z.string(),
    address: z.string(), // not .email() — some are Exchange legacy paths
  }),
});

export const EmailTagSchema = z.object({
  signal: z.string(),
  confidence: z.number().min(0).max(1),
  category: z.enum(["engagement", "urgency", "sentiment", "intent"]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const EmailMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  subject: z.string(),
  from: EmailSenderSchema,
  receivedDateTime: z.string().datetime(),
  bodyPreview: z.string(),
  tags: z.array(EmailTagSchema).optional(),
});

export const ThreadTagSchema = z.object({
  pattern: z.string(),
  score: z.number().min(0).max(1),
  closeLikelihood: z.number().min(0).max(1).optional(),
});

export const EmailThreadSchema = z.object({
  conversationId: z.string(),
  subject: z.string(),
  messages: z.array(EmailMessageSchema),
  threadTags: z.array(ThreadTagSchema).optional(),
  product: z.string().optional(),
  mainContact: z.string().optional(),
});

export const ThreadListResponseSchema = z.object({
  threads: z.array(EmailThreadSchema),
  nextLink: z.string().url().optional(),
});
