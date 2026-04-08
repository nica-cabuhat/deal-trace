"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  readConversationIdFromItem,
  readSubjectFromItem,
} from "@/lib/outlook/readConversationId";

export interface UseMailboxConversationOptions {
  onConversationChanged?: () => void;
}

const OFFICE_POLL_MS = 50;
const OFFICE_WAIT_MS = 15_000;
const ITEM_POLL_MS = 1_500;

function scheduleAfterMount(mounted: () => boolean, fn: () => void): void {
  window.setTimeout(() => {
    if (mounted()) fn();
  }, 0);
}

export function useMailboxConversation(
  options?: UseMailboxConversationOptions,
): {
  conversationId: string | null;
  itemSubject: string | null;
  userEmail: string | null;
  isOfficeReady: boolean;
} {
  const onConversationChangedRef = useRef(options?.onConversationChanged);
  const mountedRef = useRef(false);
  const lastIdRef = useRef<string | null>(null);

  useEffect(() => {
    onConversationChangedRef.current = options?.onConversationChanged;
  }, [options?.onConversationChanged]);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [itemSubject, setItemSubject] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isOfficeReady, setIsOfficeReady] = useState(false);

  const readAndUpdate = useCallback(
    (fireChanged: boolean) => {
      if (typeof Office === "undefined" || !Office.context?.mailbox?.item) {
        scheduleAfterMount(
          () => mountedRef.current,
          () => {
            if (lastIdRef.current !== null && fireChanged) {
              onConversationChangedRef.current?.();
            }
            lastIdRef.current = null;
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
        scheduleAfterMount(
          () => mountedRef.current,
          () => {
            const key = id ?? sub;
            if (key !== lastIdRef.current) {
              if (fireChanged && lastIdRef.current !== null) {
                onConversationChangedRef.current?.();
              }
              lastIdRef.current = key;
              setConversationId(id);
              setItemSubject(sub);
            }
          },
        );
      });
    },
    [],
  );

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    let initIntervalId: ReturnType<typeof setInterval> | undefined;
    let pollIntervalId: ReturnType<typeof setInterval> | undefined;

    const isMounted = () => mountedRef.current && !cancelled;

    const startItemPolling = () => {
      pollIntervalId = setInterval(() => {
        if (cancelled) return;
        readAndUpdate(true);
      }, ITEM_POLL_MS);
    };

    const attachMailboxHandlers = () => {
      try {
        Office.context.mailbox.addHandlerAsync(
          Office.EventType.ItemChanged,
          () => readAndUpdate(true),
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
        try {
          const email = Office.context.mailbox?.userProfile?.emailAddress;
          if (email) setUserEmail(email.toLowerCase());
        } catch {
          /* userProfile may not be available in all hosts */
        }
        readAndUpdate(false);
        attachMailboxHandlers();
        startItemPolling();
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
        if (pollIntervalId !== undefined) clearInterval(pollIntervalId);
      };
    }

    const started = Date.now();
    initIntervalId = setInterval(() => {
      if (cancelled) return;

      if (typeof Office !== "undefined") {
        if (initIntervalId !== undefined) clearInterval(initIntervalId);
        initIntervalId = undefined;
        Office.onReady(() => {
          if (cancelled) return;
          afterOfficeReady();
        });
        return;
      }

      if (Date.now() - started > OFFICE_WAIT_MS) {
        if (initIntervalId !== undefined) clearInterval(initIntervalId);
        initIntervalId = undefined;
        scheduleAfterMount(isMounted, () => setIsOfficeReady(true));
      }
    }, OFFICE_POLL_MS);

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (initIntervalId !== undefined) clearInterval(initIntervalId);
      if (pollIntervalId !== undefined) clearInterval(pollIntervalId);
    };
  }, [readAndUpdate]);

  return { conversationId, itemSubject, userEmail, isOfficeReady };
}
