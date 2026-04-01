import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { getGraphClient } from "@/lib/graph/client";
import { EmailMessageSchema } from "@/lib/schemas/thread.schema";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { EmailMessage } from "@/lib/types/thread";

const RawMessagesSchema = z.object({
  value: z.array(EmailMessageSchema),
});

function stripReplyPrefixes(s: string): string {
  return s.replace(/^(?:(?:RE|FW|FWD)\s*:\s*)+/i, "").trim();
}

/**
 * Pick the largest group of messages that share a conversationId.
 * Handles the case where Office.js and Graph API use different IDs.
 */
function pickLargestThread(msgs: EmailMessage[]): EmailMessage[] {
  const groups = new Map<string, EmailMessage[]>();
  for (const m of msgs) {
    const arr = groups.get(m.conversationId) ?? [];
    arr.push(m);
    groups.set(m.conversationId, arr);
  }
  let best: EmailMessage[] = [];
  for (const group of groups.values()) {
    if (group.length > best.length) best = group;
  }
  return best;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken || session.error === "RefreshTokenError") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversationId = req.nextUrl.searchParams.get("conversationId");
  const subject = req.nextUrl.searchParams.get("subject");

  if (!conversationId && !subject) {
    return NextResponse.json(
      { error: "conversationId or subject query param is required" },
      { status: 400 },
    );
  }

  const client = getGraphClient(session.accessToken);
  const fields = "id,conversationId,subject,from,receivedDateTime,bodyPreview";

  let messages: EmailMessage[] = [];

  // Strategy 1: $filter by conversationId (works for work/school accounts)
  if (conversationId) {
    try {
      const raw = await client
        .api("/me/messages")
        .filter(`conversationId eq '${conversationId}'`)
        .select(fields)
        .orderby("receivedDateTime asc")
        .top(50)
        .get();

      const parsed = RawMessagesSchema.safeParse(raw);
      if (parsed.success && parsed.data.value.length > 0) {
        messages = parsed.data.value;
      }
    } catch {
      // Personal accounts throw "restriction too complex" — fall through
    }
  }

  // Strategy 2: $search by subject (works for personal accounts)
  if (messages.length === 0 && subject) {
    const baseSubject = stripReplyPrefixes(subject)
      .split(/[\u2014\u2013|]/)[0]
      .trim();

    try {
      const raw = await client
        .api("/me/messages")
        .search(`"subject:${baseSubject}"`)
        .select(fields)
        .top(50)
        .get();

      const parsed = RawMessagesSchema.safeParse(raw);
      if (parsed.success && parsed.data.value.length > 0) {
        const all = parsed.data.value;

        // Try matching by conversationId first
        if (conversationId) {
          const exact = all.filter((m) => m.conversationId === conversationId);
          messages = exact.length > 0 ? exact : pickLargestThread(all);
        } else {
          messages = pickLargestThread(all);
        }
      }
    } catch (err) {
      console.error("[graph/conversation] Search fallback failed", err);
    }
  }

  // Strategy 3: broad fetch of recent messages
  if (messages.length === 0 && conversationId) {
    try {
      const raw = await client
        .api("/me/messages")
        .select(fields)
        .orderby("receivedDateTime desc")
        .top(200)
        .get();

      const parsed = RawMessagesSchema.safeParse(raw);
      if (parsed.success) {
        messages = parsed.data.value.filter(
          (m) => m.conversationId === conversationId,
        );
      }
    } catch (err) {
      console.error("[graph/conversation] Broad fetch failed", err);
    }
  }

  if (messages.length === 0) {
    return NextResponse.json(
      { error: "No messages found for this conversation" },
      { status: 404 },
    );
  }

  messages.sort(
    (a, b) =>
      new Date(a.receivedDateTime).getTime() -
      new Date(b.receivedDateTime).getTime(),
  );

  const thread = {
    conversationId: messages[0].conversationId,
    subject: stripReplyPrefixes(messages[0].subject),
    messages,
  };

  console.log(
    `[graph/conversation] "${thread.subject}" — ${messages.length} messages`,
  );

  return NextResponse.json({ thread });
}
