import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { getGraphClient } from "@/lib/graph/client";
import { groupIntoThreads } from "@/lib/graph/groupThreads";
import { EmailMessageSchema } from "@/lib/schemas/thread.schema";
import { NextResponse } from "next/server";
import { z } from "zod";

const RawMessagesSchema = z.object({
  value: z.array(EmailMessageSchema),
  "@odata.nextLink": z.string().url().optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = getGraphClient(session.accessToken);

  let raw: unknown;
  try {
    raw = await client
      .api("/me/messages")
      .select("id,conversationId,subject,from,receivedDateTime,bodyPreview")
      .top(50)
      .get();
  } catch (error) {
    console.error("[graph/threads] Graph API error", error);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 502 });
  }

  const parsed = RawMessagesSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("[graph/threads] Graph response failed Zod validation", parsed.error);
    return NextResponse.json({ error: "Unexpected Graph API shape" }, { status: 502 });
  }

  const threads = groupIntoThreads(parsed.data.value);

  return NextResponse.json({
    threads,
    nextLink: parsed.data["@odata.nextLink"],
  });
}
