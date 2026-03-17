import { useMutation } from "@tanstack/react-query";
import { AnalyzeResponseSchema } from "@/lib/schemas/analyze.schema";
import type { EmailMessage, ThreadTag } from "@/lib/types/thread";

interface AnalyzeResult {
  messages: EmailMessage[];
  threadTags: ThreadTag[];
  product?: string;
  mainContact?: string;
}

export function useAnalyze() {
  return useMutation<AnalyzeResult, Error, EmailMessage[]>({
    mutationFn: async (messages: EmailMessage[]) => {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });

      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(error ?? "Analysis failed");
      }

      return AnalyzeResponseSchema.parse(await res.json());
    },
  });
}
