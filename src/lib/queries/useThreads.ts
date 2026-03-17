import { useQuery } from '@tanstack/react-query'
import { ThreadListResponseSchema } from '@/lib/schemas/thread.schema'
import type { ThreadListResponse } from '@/lib/types/thread'

export function useThreads() {
  return useQuery<ThreadListResponse>({
    queryKey: ['threads'],
    queryFn: async () => {
      const res = await fetch('/api/graph/threads')
      if (!res.ok) throw new Error('Failed to fetch threads')
      return ThreadListResponseSchema.parse(await res.json())
    },
    enabled: true,
  })
}
