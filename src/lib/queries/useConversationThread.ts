import { useQuery } from "@tanstack/react-query";
import { EmailThreadSchema } from "@/lib/schemas/thread.schema";
import type { EmailThread } from "@/lib/types/thread";

interface ConversationResult {
  thread: EmailThread | null;
  isUnauthorized: boolean;
}

export function useConversationThread(
  conversationId: string | null | undefined,
  subject: string | null | undefined,
) {
  return useQuery<ConversationResult>({
    queryKey: ["conversation", conversationId ?? null, subject ?? null],
    queryFn: async (): Promise<ConversationResult> => {
      const params = new URLSearchParams();
      if (conversationId) params.set("conversationId", conversationId);
      else if (subject) params.set("subject", subject);

      const res = await fetch(`/api/graph/conversation?${params.toString()}`);

      if (res.status === 401) {
        return { thread: null, isUnauthorized: true };
      }

      if (res.status === 404) {
        return { thread: null, isUnauthorized: false };
      }

      if (!res.ok) {
        throw new Error("Failed to fetch conversation");
      }

      const data = await res.json();
      const thread = EmailThreadSchema.parse(data.thread);
      return { thread, isUnauthorized: false };
    },
    enabled: !!(conversationId || subject),
    staleTime: 60_000,
    retry: (count, error) => {
      if (error.message.includes("401")) return false;
      return count < 2;
    },
  });
}
