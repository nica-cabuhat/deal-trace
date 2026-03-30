"use client";

/// <reference types="office-js" />

import { useQuery } from "@tanstack/react-query";
import { EmailThreadSchema } from "@/lib/schemas/thread.schema";
import type { EmailThread } from "@/lib/types/thread";

interface OutlookThreadResult {
  thread: EmailThread | null;
  isOfficeUnavailable: boolean;
}

function getCallbackToken(): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof Office === "undefined" || !Office.context?.mailbox) {
      resolve(null);
      return;
    }

    Office.context.mailbox.getCallbackTokenAsync(
      { isRest: true },
      (result: Office.AsyncResult<string>) => {
        if (
          result.status === Office.AsyncResultStatus.Succeeded &&
          result.value
        ) {
          resolve(result.value);
        } else {
          resolve(null);
        }
      },
    );
  });
}

function getRestUrl(): string | null {
  if (typeof Office === "undefined" || !Office.context?.mailbox) return null;
  return (Office.context.mailbox as Office.Mailbox & { restUrl?: string })
    .restUrl ?? null;
}

/**
 * Fetches the full conversation thread directly from Outlook using the
 * Office.js callback token — no NextAuth sign-in required.
 *
 * @param isOfficeReady — pass from `useMailboxConversation` so the query
 *   waits until Office.js is fully initialized before attempting token fetch.
 */
export function useOutlookThread(
  conversationId: string | null | undefined,
  isOfficeReady: boolean,
) {
  return useQuery<OutlookThreadResult>({
    queryKey: ["outlook-thread", conversationId ?? null],
    queryFn: async (): Promise<OutlookThreadResult> => {
      const token = await getCallbackToken();
      const restUrl = getRestUrl();

      if (!token || !restUrl) {
        return { thread: null, isOfficeUnavailable: true };
      }

      const res = await fetch("/api/outlook/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, restUrl, conversationId }),
      });

      if (res.status === 404) {
        return { thread: null, isOfficeUnavailable: false };
      }

      if (!res.ok) {
        throw new Error(`Outlook conversation fetch failed (${res.status})`);
      }

      const data = await res.json();
      const thread = EmailThreadSchema.parse(data.thread);
      return { thread, isOfficeUnavailable: false };
    },
    enabled: !!conversationId && isOfficeReady,
    staleTime: 60_000,
    retry: 1,
  });
}
