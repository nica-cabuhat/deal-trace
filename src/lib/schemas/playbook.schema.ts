import { z } from 'zod'

export const PlaybookThreadSchema = z.object({
  conversationId: z.string(),
  subject: z.string(),
  closeLikelihood: z.number().min(0).max(1),
  patterns: z.array(z.string()),
  recommendedActions: z.array(z.string()),
})

export const PlaybookSummarySchema = z.object({
  totalThreads: z.number().int().nonnegative(),
  highPriorityCount: z.number().int().nonnegative(),
  avgCloseLikelihood: z.number().min(0).max(1),
})

export const RepPlaybookSchema = z.object({
  repId: z.string(),
  generatedAt: z.string().datetime(),
  threads: z.array(PlaybookThreadSchema),
  summary: PlaybookSummarySchema,
})
