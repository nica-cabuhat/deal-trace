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

function getRestToken(): Promise<string | null> {
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
          console.warn("[outlook] REST token failed:", result.error);
          resolve(null);
        }
      },
    );
  });
}

function getEwsToken(): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof Office === "undefined" || !Office.context?.mailbox) {
      resolve(null);
      return;
    }

    Office.context.mailbox.getCallbackTokenAsync(
      (result: Office.AsyncResult<string>) => {
        if (
          result.status === Office.AsyncResultStatus.Succeeded &&
          result.value
        ) {
          resolve(result.value);
        } else {
          console.warn("[outlook] EWS token failed:", result.error);
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

function getEwsUrl(): string | null {
  if (typeof Office === "undefined" || !Office.context?.mailbox) return null;
  const url = Office.context.mailbox.ewsUrl;
  return typeof url === "string" && url.length > 0 ? url : null;
}

function stripReplyPrefixes(subject: string): string {
  return subject.replace(/^(?:(?:RE|FW|FWD)\s*:\s*)+/i, "").trim();
}

/** Truncate at em dash / en dash / pipe to keep only ASCII for EWS search. */
function getSearchableSubject(subject: string): string {
  const base = stripReplyPrefixes(subject);
  const truncated = base.split(/[\u2014\u2013|]/)[0].trim();
  return truncated || base;
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

/* ── Strategy 2: Server-side EWS (token from getCallbackTokenAsync) ─────── */

async function fetchViaServerEws(
  ewsToken: string,
  ewsUrl: string,
  subject: string,
  conversationId: string,
): Promise<EmailThread | null> {
  const res = await fetch("/api/outlook/ews-thread", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ewsToken, ewsUrl, subject, conversationId }),
  });

  if (!res.ok) {
    console.warn(`[outlook] Server EWS returned ${res.status}`);
    return null;
  }

  const data = await res.json();
  if (!data.thread) return null;
  return EmailThreadSchema.parse(data.thread);
}

/* ── Strategy 3: Client-side EWS via makeEwsRequestAsync ────────────────── */

function findConversationViaClientEws(
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

    const searchSubject = escapeXml(getSearchableSubject(subject));

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
      `        <t:Constant Value="${searchSubject}"/>`,
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
        console.warn("[EWS client] FindItem failed:", result.error);
        resolve(null);
        return;
      }

      try {
        const doc = new DOMParser().parseFromString(result.value, "text/xml");
        const ns =
          "http://schemas.microsoft.com/exchange/services/2006/types";
        const nodes = doc.getElementsByTagNameNS(ns, "Message");

        if (nodes.length === 0) {
          console.warn("[EWS client] 0 messages found");
          resolve(null);
          return;
        }

        const messages: EmailMessage[] = [];

        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          const t = (name: string) =>
            node.getElementsByTagNameNS(ns, name)[0]?.textContent ?? "";

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
            subject: t("Subject") || subject,
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
              t("DateTimeReceived") || new Date().toISOString(),
            ),
            bodyPreview: t("Preview"),
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
        console.error("[EWS client] Parse error:", err);
        resolve(null);
      }
    });
  });
}

/* ── Strategy 4: read the single currently-selected item ────────────────── */

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
        const subj = item.subject ?? "No Subject";
        const created = item.dateTimeCreated;
        const convId =
          (item as unknown as { conversationId?: string }).conversationId ??
          item.itemId ??
          crypto.randomUUID();
        const itemId = item.itemId ?? crypto.randomUUID();

        const message: EmailMessage = {
          id: itemId,
          conversationId: convId,
          subject: subj,
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

        resolve({ conversationId: convId, subject: subj, messages: [message] });
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
 * Fetches the conversation thread from Outlook using a 4-tier strategy:
 *   1. REST API (`getCallbackTokenAsync` with `isRest: true`)
 *   2. Server-side EWS (`getCallbackTokenAsync` without isRest + ewsUrl)
 *   3. Client-side EWS (`makeEwsRequestAsync`)
 *   4. Read the single selected item from Office.js (last resort)
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
      const restToken = await getRestToken();
      const restUrl = getRestUrl();

      if (restToken && restUrl && conversationId) {
        try {
          const thread = await fetchViaRestApi(conversationId, restToken, restUrl);
          if (thread) return { thread, isOfficeUnavailable: false };
        } catch (err) {
          console.warn("[outlook] REST failed:", err);
        }
      }

      /* 2. Server-side EWS */
      if (subject && conversationId) {
        const ewsToken = await getEwsToken();
        const ewsUrl = getEwsUrl();

        if (ewsToken && ewsUrl) {
          try {
            const thread = await fetchViaServerEws(
              ewsToken,
              ewsUrl,
              subject,
              conversationId,
            );
            if (thread) return { thread, isOfficeUnavailable: false };
          } catch (err) {
            console.warn("[outlook] Server EWS failed:", err);
          }
        }
      }

      /* 3. Client-side EWS */
      if (conversationId && subject) {
        const ewsThread = await findConversationViaClientEws(
          conversationId,
          subject,
        );
        if (ewsThread) {
          return { thread: ewsThread, isOfficeUnavailable: false };
        }
      }

      /* 4. Read current item */
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
