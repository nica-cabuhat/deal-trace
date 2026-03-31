import { NextResponse } from "next/server";
import { z } from "zod";

const RequestSchema = z.object({
  ewsToken: z.string().min(1),
  ewsUrl: z.string().url(),
  subject: z.string().min(1),
  conversationId: z.string().min(1),
});

function stripReplyPrefixes(s: string): string {
  return s.replace(/^(?:(?:RE|FW|FWD)\s*:\s*)+/i, "").trim();
}

/**
 * Truncate at em dash / en dash / pipe so the EWS substring search
 * uses only plain-ASCII characters — avoids Unicode matching issues.
 */
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

function decodeXml(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function safeIso(raw: string): string {
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<(?:t:)?${name}[^>]*>([^<]*)</(?:t:)?${name}>`, "i"));
  return m ? decodeXml(m[1]) : "";
}

function attr(xml: string, tagName: string, attrName: string): string {
  const m = xml.match(
    new RegExp(`<(?:t:)?${tagName}[^>]*?\\b${attrName}="([^"]*)"`, "i"),
  );
  return m ? decodeXml(m[1]) : "";
}

interface EwsMessage {
  id: string;
  conversationId: string;
  subject: string;
  from: { emailAddress: { name: string; address: string } };
  receivedDateTime: string;
  bodyPreview: string;
}

function parseEwsXml(xml: string, conversationId: string, fallbackSubject: string): EwsMessage[] {
  const messages: EwsMessage[] = [];
  const blocks = xml.split(/<(?:t:)?Message\b[^>]*>/i).slice(1);

  for (const block of blocks) {
    const msgXml = block.split(/<\/(?:t:)?Message>/i)[0] ?? "";

    const fromMatch = msgXml.match(/<(?:t:)?From>([\s\S]*?)<\/(?:t:)?From>/i);
    const fromXml = fromMatch?.[1] ?? "";

    messages.push({
      id: attr(msgXml, "ItemId", "Id") || crypto.randomUUID(),
      conversationId,
      subject: tag(msgXml, "Subject") || fallbackSubject,
      from: {
        emailAddress: {
          name: tag(fromXml, "Name") || "Unknown",
          address: tag(fromXml, "EmailAddress") || "unknown@unknown.com",
        },
      },
      receivedDateTime: safeIso(tag(msgXml, "DateTimeReceived")),
      bodyPreview: tag(msgXml, "Preview"),
    });
  }

  return messages.sort(
    (a, b) =>
      new Date(a.receivedDateTime).getTime() -
      new Date(b.receivedDateTime).getTime(),
  );
}

function buildSoap(searchSubject: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
               xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <t:RequestServerVersion Version="Exchange2013"/>
  </soap:Header>
  <soap:Body>
    <m:FindItem Traversal="Shallow">
      <m:ItemShape>
        <t:BaseShape>Default</t:BaseShape>
        <t:AdditionalProperties>
          <t:FieldURI FieldURI="item:Subject"/>
          <t:FieldURI FieldURI="item:DateTimeReceived"/>
          <t:FieldURI FieldURI="message:From"/>
          <t:FieldURI FieldURI="item:Preview"/>
        </t:AdditionalProperties>
      </m:ItemShape>
      <m:IndexedPageItemView MaxEntriesReturned="50" Offset="0" BasePoint="Beginning"/>
      <m:Restriction>
        <t:Contains ContainmentMode="Substring" ContainmentComparison="IgnoreCase">
          <t:FieldURI FieldURI="item:Subject"/>
          <t:Constant Value="${searchSubject}"/>
        </t:Contains>
      </m:Restriction>
      <m:SortOrder>
        <t:FieldOrder Order="Ascending">
          <t:FieldURI FieldURI="item:DateTimeReceived"/>
        </t:FieldOrder>
      </m:SortOrder>
      <m:ParentFolderIds>
        <t:DistinguishedFolderId Id="inbox"/>
        <t:DistinguishedFolderId Id="sentitems"/>
      </m:ParentFolderIds>
    </m:FindItem>
  </soap:Body>
</soap:Envelope>`;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { ewsToken, ewsUrl, subject, conversationId } = parsed.data;
  const searchSubject = escapeXml(getSearchableSubject(subject));

  console.log(`[ews-thread] Searching "${searchSubject}" via ${ewsUrl}`);

  let ewsRes: Response;
  try {
    ewsRes = await fetch(ewsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        Authorization: `Bearer ${ewsToken}`,
      },
      body: buildSoap(searchSubject),
    });
  } catch (err) {
    console.error("[ews-thread] Fetch error:", err);
    return NextResponse.json(
      { error: "Failed to reach Exchange server" },
      { status: 502 },
    );
  }

  if (!ewsRes.ok) {
    const errorBody = await ewsRes.text().catch(() => "");
    console.error(`[ews-thread] EWS ${ewsRes.status}:`, errorBody.slice(0, 500));
    return NextResponse.json(
      { error: `EWS error (${ewsRes.status})` },
      { status: 502 },
    );
  }

  const xml = await ewsRes.text();
  const messages = parseEwsXml(xml, conversationId, stripReplyPrefixes(subject));

  console.log(`[ews-thread] Found ${messages.length} messages`);

  if (messages.length === 0) {
    return NextResponse.json({ thread: null });
  }

  const thread = {
    conversationId,
    subject: stripReplyPrefixes(subject),
    messages,
  };

  return NextResponse.json({ thread });
}
