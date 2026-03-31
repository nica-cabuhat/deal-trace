"use client";

/// <reference types="office-js" />

import { useQuery } from "@tanstack/react-query";
import { EmailThreadSchema } from "@/lib/schemas/thread.schema";
import type { EmailThread, EmailMessage } from "@/lib/types/thread";

interface OutlookThreadResult {
  thread: EmailThread | null;
  isOfficeUnavailable: boolean;
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

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
  return (
    (Office.context.mailbox as Office.Mailbox & { restUrl?: string }).restUrl ??
    null
  );
}

function stripReplyPrefixes(subject: string): string {
  return subject.replace(/^(?:(?:RE|FW|FWD)\s*:\s*)+/i, "").trim();
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safeIsoDate(raw: string): string {
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/* ── Strategy 1: Outlook REST API (work/school accounts) ────────────────── */

async function fetchViaRestApi(
  conversationId: string,
  token: string,
  restUrl: string,
): Promise<EmailThread | null> {
  const res = await fetch("/api/outlook/conversation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, restUrl, conversationId }),
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`REST ${res.status}`);

  const data = await res.json();
  return EmailThreadSchema.parse(data.thread);
}

/* ── Strategy 2: EWS FindItem via makeEwsRequestAsync ───────────────────── */

function findConversationViaEws(
  conversationId: string,
  subject: string,
): Promise<EmailThread | null> {
  return new Promise((resolve) => {
    if (
      typeof Office === "undefined" ||
      !Office.context?.mailbox ||
      typeof Office.context.mailbox.makeEwsRequestAsync !== "function"
    ) {
      resolve(null);
      return;
    }

    const baseSubject = escapeXml(stripReplyPrefixes(subject));

    const soap = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
      '  xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"',
      '  xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"',
      '  xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
      "<soap:Header>",
      '  <t:RequestServerVersion Version="Exchange2013"/>',
      "</soap:Header>",
      "<soap:Body>",
      '  <m:FindItem Traversal="Shallow">',
      "    <m:ItemShape>",
      "      <t:BaseShape>Default</t:BaseShape>",
      "      <t:AdditionalProperties>",
      '        <t:FieldURI FieldURI="item:Subject"/>',
      '        <t:FieldURI FieldURI="item:DateTimeReceived"/>',
      '        <t:FieldURI FieldURI="message:From"/>',
      '        <t:FieldURI FieldURI="item:Preview"/>',
      "      </t:AdditionalProperties>",
      "    </m:ItemShape>",
      '    <m:IndexedPageItemView MaxEntriesReturned="50" Offset="0" BasePoint="Beginning"/>',
      "    <m:Restriction>",
      '      <t:Contains ContainmentMode="Substring" ContainmentComparison="IgnoreCase">',
      '        <t:FieldURI FieldURI="item:Subject"/>',
      `        <t:Constant Value="${baseSubject}"/>`,
      "      </t:Contains>",
      "    </m:Restriction>",
      "    <m:SortOrder>",
      '      <t:FieldOrder Order="Ascending">',
      '        <t:FieldURI FieldURI="item:DateTimeReceived"/>',
      "      </t:FieldOrder>",
      "    </m:SortOrder>",
      "    <m:ParentFolderIds>",
      '      <t:DistinguishedFolderId Id="inbox"/>',
      '      <t:DistinguishedFolderId Id="sentitems"/>',
      "    </m:ParentFolderIds>",
      "  </m:FindItem>",
      "</soap:Body>",
      "</soap:Envelope>",
    ].join("\n");

    Office.context.mailbox.makeEwsRequestAsync(soap, (result) => {
      if (result.status !== Office.AsyncResultStatus.Succeeded) {
        console.warn("[EWS] FindItem failed:", result.error);
        resolve(null);
        return;
      }

      try {
        const doc = new DOMParser().parseFromString(result.value, "text/xml");
        const ns =
          "http://schemas.microsoft.com/exchange/services/2006/types";
        const nodes = doc.getElementsByTagNameNS(ns, "Message");

        if (nodes.length === 0) {
          resolve(null);
          return;
        }

        const messages: EmailMessage[] = [];

        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          const tag = (t: string) =>
            node.getElementsByTagNameNS(ns, t)[0]?.textContent ?? "";

          const itemId =
            node
              .getElementsByTagNameNS(ns, "ItemId")[0]
              ?.getAttribute("Id") ?? crypto.randomUUID();

          const fromMailbox = node
            .getElementsByTagNameNS(ns, "From")[0]
            ?.getElementsByTagNameNS(ns, "Mailbox")[0];

          messages.push({
            id: itemId,
            conversationId,
            subject: tag("Subject") || subject,
            from: {
              emailAddress: {
                name:
                  fromMailbox
                    ?.getElementsByTagNameNS(ns, "Name")[0]
                    ?.textContent ?? "Unknown",
                address:
                  fromMailbox
                    ?.getElementsByTagNameNS(ns, "EmailAddress")[0]
                    ?.textContent ?? "unknown@unknown.com",
              },
            },
            receivedDateTime: safeIsoDate(
              tag("DateTimeReceived") || new Date().toISOString(),
            ),
            bodyPreview: tag("Preview"),
          });
        }

        messages.sort(
          (a, b) =>
            new Date(a.receivedDateTime).getTime() -
            new Date(b.receivedDateTime).getTime(),
        );

        resolve({
          conversationId,
          subject: stripReplyPrefixes(subject),
          messages,
        });
      } catch (err) {
        console.error("[EWS] XML parse error:", err);
        resolve(null);
      }
    });
  });
}

/* ── Strategy 3: read the single currently-selected item ────────────────── */

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

        resolve({ conversationId: convId, subject, messages: [message] });
      } catch (err) {
        console.error("[readCurrentItem] Error:", err);
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

/* ── hook ────────────────────────────────────────────────────────────────── */

/**
 * Fetches the conversation thread from Outlook using a 3-tier strategy:
 *   1. REST API (work/school accounts with `getCallbackTokenAsync`)
 *   2. EWS `FindItem` via `makeEwsRequestAsync` (all account types)
 *   3. Read the single selected item from Office.js (last resort)
 */
export function useOutlookThread(
  conversationId: string | null | undefined,
  subject: string | null | undefined,
  isOfficeReady: boolean,
) {
  return useQuery<OutlookThreadResult>({
    queryKey: ["outlook-thread", conversationId ?? null],
    queryFn: async (): Promise<OutlookThreadResult> => {
      /* 1. REST API */
      const token = await getCallbackToken();
      const restUrl = getRestUrl();

      if (token && restUrl && conversationId) {
        try {
          const thread = await fetchViaRestApi(conversationId, token, restUrl);
          if (thread) return { thread, isOfficeUnavailable: false };
        } catch (err) {
          console.warn("[useOutlookThread] REST failed, trying EWS:", err);
        }
      }

      /* 2. EWS FindItem */
      if (conversationId && subject) {
        const ewsThread = await findConversationViaEws(conversationId, subject);
        if (ewsThread) {
          return { thread: ewsThread, isOfficeUnavailable: false };
        }
      }

      /* 3. Read current item */
      const singleItem = await readCurrentItem();
      if (singleItem) {
        return { thread: singleItem, isOfficeUnavailable: false };
      }

      return { thread: null, isOfficeUnavailable: true };
    },
    enabled: !!conversationId && isOfficeReady,
    staleTime: 60_000,
    retry: 1,
  });
}
