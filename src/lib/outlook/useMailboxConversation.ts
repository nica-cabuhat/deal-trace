"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  readConversationIdFromItem,
  readSubjectFromItem,
} from "@/lib/outlook/readConversationId";

export interface UseMailboxConversationOptions {
  /** Fires when the selected mail item changes (e.g. clear manual list selection). */
  onConversationChanged?: () => void;
}

const OFFICE_POLL_MS = 50;
const OFFICE_WAIT_MS = 15000;

/**
 * Outlook / embedded WebViews can fire Office callbacks before React has finished
 * mounting; defer state updates to the next task.
 */
function scheduleAfterMount(mounted: () => boolean, fn: () => void): void {
  window.setTimeout(() => {
    if (mounted()) fn();
  }, 0);
}

/**
 * Tracks the conversation ID (and subject) of the mail item open in Outlook.
 * Waits for the hosted `office.js` script (see `taskpane/layout.tsx`) and polls until
 * `Office` exists so slow loads are not missed.
 */
export function useMailboxConversation(
  options?: UseMailboxConversationOptions,
): {
  conversationId: string | null;
  itemSubject: string | null;
  isOfficeReady: boolean;
} {
  const onConversationChangedRef = useRef(options?.onConversationChanged);

  const mountedRef = useRef(false);

  useEffect(() => {
    onConversationChangedRef.current = options?.onConversationChanged;
  }, [options?.onConversationChanged]);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [itemSubject, setItemSubject] = useState<string | null>(null);
  const [isOfficeReady, setIsOfficeReady] = useState(false);

  const refresh = useCallback(() => {
    onConversationChangedRef.current?.();

    if (typeof Office === "undefined" || !Office.context?.mailbox?.item) {
      scheduleAfterMount(
        () => mountedRef.current,
        () => {
          setConversationId(null);
          setItemSubject(null);
        },
      );
      return;
    }

    const item = Office.context.mailbox.item;
    void Promise.all([
      readConversationIdFromItem(item),
      readSubjectFromItem(item),
    ]).then(([id, sub]) => {
      scheduleAfterMount(() => mountedRef.current, () => {
        setConversationId(id);
        setItemSubject(sub);
      });
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const isMounted = () => mountedRef.current && !cancelled;

    const attachMailboxHandlers = () => {
      try {
        Office.context.mailbox.addHandlerAsync(
          Office.EventType.ItemChanged,
          refresh,
          () => {
            /* non-fatal */
          },
        );
      } catch {
        /* ItemChanged not supported in some hosts */
      }
    };

    const afterOfficeReady = () => {
      scheduleAfterMount(isMounted, () => {
        setIsOfficeReady(true);
        refresh();
        attachMailboxHandlers();
      });
    };

    if (typeof Office !== "undefined") {
      Office.onReady(() => {
        if (cancelled) return;
        afterOfficeReady();
      });
      return () => {
        cancelled = true;
        mountedRef.current = false;
      };
    }

    const started = Date.now();
    intervalId = setInterval(() => {
      if (cancelled) return;

      if (typeof Office !== "undefined") {
        if (intervalId !== undefined) clearInterval(intervalId);
        intervalId = undefined;
        Office.onReady(() => {
          if (cancelled) return;
          afterOfficeReady();
        });
        return;
      }

      if (Date.now() - started > OFFICE_WAIT_MS) {
        if (intervalId !== undefined) clearInterval(intervalId);
        intervalId = undefined;
        scheduleAfterMount(isMounted, () => setIsOfficeReady(true));
      }
    }, OFFICE_POLL_MS);

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (intervalId !== undefined) clearInterval(intervalId);
    };
  }, [refresh]);

  return { conversationId, itemSubject, isOfficeReady };
}
