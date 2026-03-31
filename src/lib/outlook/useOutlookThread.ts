"use client";

/// <reference types="office-js" />

import { useQuery } from "@tanstack/react-query";
import { EmailThreadSchema } from "@/lib/schemas/thread.schema";
import type { EmailThread, EmailMessage } from "@/lib/types/thread";

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
          console.warn("[useOutlookThread] getCallbackTokenAsync failed:", result.error);
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
 * Reads the currently selected email directly from Office.js item properties.
 * Used as a fallback when the Outlook REST API is unavailable (personal accounts).
 */
function readCurrentItem(): Promise<EmailThread | null> {
  return new Promise((resolve) => {
    if (typeof Office === "undefined" || !Office.context?.mailbox?.item) {
      resolve(null);
      return;
    }

    const item = Office.context.mailbox.item as Office.MessageRead;

    const finish = (bodyText: string) => {
      try {
        const from = item.from;
        const subject = item.subject ?? "No Subject";
        const created = item.dateTimeCreated;
        const convId =
          (item as unknown as { conversationId?: string }).conversationId ??
          item.itemId ??
          crypto.randomUUID();
        const itemId = item.itemId ?? crypto.randomUUID();

        const message: EmailMessage = {
          id: itemId,
          conversationId: convId,
          subject,
          from: {
            emailAddress: {
              name: from?.displayName ?? "Unknown",
              address: from?.emailAddress ?? "unknown@unknown.com",
            },
          },
          receivedDateTime: created
            ? created.toISOString()
            : new Date().toISOString(),
          bodyPreview: bodyText.slice(0, 500),
        };

        resolve({
          conversationId: convId,
          subject,
          messages: [message],
        });
      } catch (err) {
        console.error("[readCurrentItem] Error constructing thread:", err);
        resolve(null);
      }
    };

    try {
      item.body.getAsync(
        Office.CoercionType.Text,
        (bodyResult: Office.AsyncResult<string>) => {
          const text =
            bodyResult.status === Office.AsyncResultStatus.Succeeded
              ? bodyResult.value ?? ""
              : "";
          finish(text);
        },
      );
    } catch {
      finish("");
    }
  });
}

/**
 * Fetches the conversation thread from Outlook. Tries the REST API first
 * (works for work/school accounts), then falls back to reading the current
 * mail item directly from Office.js (works for all account types).
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

      if (token && restUrl) {
        try {
          const res = await fetch("/api/outlook/conversation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, restUrl, conversationId }),
          });

          if (res.status === 404) {
            return { thread: null, isOfficeUnavailable: false };
          }

          if (res.ok) {
            const data = await res.json();
            const thread = EmailThreadSchema.parse(data.thread);
            return { thread, isOfficeUnavailable: false };
          }

          console.warn(
            `[useOutlookThread] REST API returned ${res.status}, falling back to item read`,
          );
        } catch (err) {
          console.warn("[useOutlookThread] REST API error, falling back:", err);
        }
      }

      const fallbackThread = await readCurrentItem();
      if (fallbackThread) {
        return { thread: fallbackThread, isOfficeUnavailable: false };
      }

      return { thread: null, isOfficeUnavailable: true };
    },
    enabled: !!conversationId && isOfficeReady,
    staleTime: 60_000,
    retry: 1,
  });
}
