import type { z } from 'zod'
import type {
  PlaybookThreadSchema,
  PlaybookSummarySchema,
  RepPlaybookSchema,
} from '@/lib/schemas/playbook.schema'

export type PlaybookThread = z.infer<typeof PlaybookThreadSchema>
export type PlaybookSummary = z.infer<typeof PlaybookSummarySchema>
export type RepPlaybook = z.infer<typeof RepPlaybookSchema>
