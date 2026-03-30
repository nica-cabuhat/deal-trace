import { NextResponse } from "next/server";
import { z } from "zod";

const RequestSchema = z.object({
  token: z.string().min(1),
  restUrl: z.string().url(),
  conversationId: z.string().min(1),
});

const OutlookMessageSchema = z.object({
  Id: z.string(),
  ConversationId: z.string(),
  Subject: z.string(),
  From: z.object({
    EmailAddress: z.object({
      Name: z.string(),
      Address: z.string(),
    }),
  }),
  ReceivedDateTime: z.string(),
  BodyPreview: z.string(),
});

const OutlookResponseSchema = z.object({
  value: z.array(OutlookMessageSchema),
});

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

  const { token, restUrl, conversationId } = parsed.data;

  const filter = `ConversationId eq '${conversationId.replace(/'/g, "''")}'`;
  const select = "Id,ConversationId,Subject,From,ReceivedDateTime,BodyPreview";
  const url = `${restUrl}/v2.0/me/messages?$filter=${encodeURIComponent(filter)}&$select=${select}&$orderby=ReceivedDateTime%20asc&$top=50`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    console.error("[outlook/conversation] Fetch error", error);
    return NextResponse.json(
      { error: "Failed to reach Outlook API" },
      { status: 502 },
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(
      `[outlook/conversation] Outlook API ${res.status}`,
      text.slice(0, 500),
    );
    return NextResponse.json(
      { error: `Outlook API error (${res.status})` },
      { status: res.status === 401 ? 401 : 502 },
    );
  }

  let outlookData: z.infer<typeof OutlookResponseSchema>;
  try {
    const raw = await res.json();
    outlookData = OutlookResponseSchema.parse(raw);
  } catch (error) {
    console.error("[outlook/conversation] Response validation failed", error);
    return NextResponse.json(
      { error: "Unexpected Outlook API response" },
      { status: 502 },
    );
  }

  if (outlookData.value.length === 0) {
    return NextResponse.json(
      { error: "No messages found for this conversation" },
      { status: 404 },
    );
  }

  const messages = outlookData.value.map((m) => ({
    id: m.Id,
    conversationId: m.ConversationId,
    subject: m.Subject,
    from: {
      emailAddress: {
        name: m.From.EmailAddress.Name,
        address: m.From.EmailAddress.Address,
      },
    },
    receivedDateTime: m.ReceivedDateTime,
    bodyPreview: m.BodyPreview,
  }));

  const subject = messages[0].subject.replace(/^(Re|Fwd|Fw):\s*/gi, "");
  const thread = {
    conversationId: messages[0].conversationId,
    subject,
    messages,
  };

  console.log(
    `[outlook/conversation] Thread: "${subject}" (${messages.length} messages)`,
  );

  return NextResponse.json({ thread });
}
