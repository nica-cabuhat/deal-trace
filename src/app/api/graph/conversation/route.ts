import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { getGraphClient } from "@/lib/graph/client";
import { groupIntoThreads } from "@/lib/graph/groupThreads";
import { EmailMessageSchema } from "@/lib/schemas/thread.schema";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

const RawMessagesSchema = z.object({
  value: z.array(EmailMessageSchema),
});

const SAFE_ID_RE = /^[A-Za-z0-9+/=_-]+$/;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
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

  let filter: string;
  if (conversationId && SAFE_ID_RE.test(conversationId)) {
    filter = `conversationId eq '${conversationId}'`;
  } else if (subject) {
    const clean = subject
      .replace(/^(Re|Fwd|Fw):\s*/gi, "")
      .trim()
      .replace(/'/g, "''");
    filter = `contains(subject, '${clean}')`;
  } else {
    return NextResponse.json(
      { error: "Invalid conversationId format" },
      { status: 400 },
    );
  }

  let raw: unknown;
  try {
    raw = await client
      .api("/me/messages")
      .filter(filter)
      .select("id,conversationId,subject,from,receivedDateTime,bodyPreview")
      .orderby("receivedDateTime asc")
      .top(50)
      .get();
  } catch (error) {
    console.error("[graph/conversation] Graph API error", error);
    return NextResponse.json(
      { error: "Failed to fetch conversation" },
      { status: 502 },
    );
  }

  const parsed = RawMessagesSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(
      "[graph/conversation] Graph response failed Zod validation",
      parsed.error,
    );
    return NextResponse.json(
      { error: "Unexpected Graph API shape" },
      { status: 502 },
    );
  }

  if (parsed.data.value.length === 0) {
    return NextResponse.json(
      { error: "No messages found for this conversation" },
      { status: 404 },
    );
  }

  const threads = groupIntoThreads(parsed.data.value);
  const thread = threads[0];

  return NextResponse.json({ thread });
}
