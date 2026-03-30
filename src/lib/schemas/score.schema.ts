import { z } from "zod";
import { EmailThreadSchema } from "./thread.schema";

export const ScoreRequestSchema = z.object({
  thread: EmailThreadSchema,
  includeDraft: z.boolean().optional(),
});

// Raw Groq response — null-safe
export const GroqScoreResponseSchema = z.object({
  healthScore: z.number().min(0).max(100),
  prediction: z.enum(["on_track", "at_risk", "critical"]),
  winFactors: z.array(z.string()),
  riskFactors: z.array(z.string()),
  recommendations: z.array(z.string()),
  draftEmail: z.string().nullish().transform((v) => v ?? undefined),
});

export const ThreadHealthSchema = z.object({
  healthScore: z.number().min(0).max(100),
  prediction: z.enum(["on_track", "at_risk", "critical"]),
  winFactors: z.array(z.string()),
  riskFactors: z.array(z.string()),
  recommendations: z.array(z.string()),
  draftEmail: z.string().optional(),
});

export const ScoreResponseSchema = ThreadHealthSchema;
