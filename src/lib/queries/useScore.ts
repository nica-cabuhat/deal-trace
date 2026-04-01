import { useMutation } from "@tanstack/react-query";
import { ScoreResponseSchema } from "@/lib/schemas/score.schema";
import type { z } from "zod";
import type { EmailThread } from "@/lib/types/thread";

export type ThreadHealth = z.infer<typeof ScoreResponseSchema>;

interface ScoreRequest {
  thread: EmailThread;
  includeDraft?: boolean;
  retrospective?: boolean;
}

export function useScore() {
  return useMutation<ThreadHealth, Error, ScoreRequest>({
    mutationFn: async ({ thread, includeDraft = false, retrospective = false }) => {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread, includeDraft, retrospective }),
      });

      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(error ?? "Scoring failed");
      }

      return ScoreResponseSchema.parse(await res.json());
    },
  });
}
