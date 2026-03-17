import { NextResponse } from "next/server";
import { getGroqClient } from "@/lib/groq/client";
import {
  AnalyzeRequestSchema,
  AnalyzeResponseSchema,
  GroqTagsResponseSchema,
} from "@/lib/schemas/analyze.schema";
import { env } from "@/lib/schemas/env.schema";

const SYSTEM_PROMPT = `You are a sales intelligence assistant. Analyze a sales email thread and return the following:

1. Per-message tags — behavioral signals for each individual message
2. Thread-level tags — patterns observed across the conversation as a whole
3. Product — the product or solution being discussed
4. Main contact — the primary prospect contact (not the seller)

--- Per-message tags ---
For each message return an array of tags. Each tag:
- signal: concise phrase describing the behavior (e.g. "expressed EOL deadline pressure", "looped in IT stakeholder", "approved proposal internally")
- confidence: float 0.0–1.0
- category: one of "engagement", "urgency", "sentiment", "intent"

Categories:
- engagement: how actively the person participates (e.g. "asked follow-up question", "looped in decision maker", "shared datasheet internally")
- urgency: time or deadline pressure (e.g. "mentioned EOL in 6 months", "wants to close before Q1 end")
- sentiment: emotional tone (e.g. "enthusiastic and positive", "hesitant", "neutral inquiry")
- intent: buying or decision signals (e.g. "requested proposal", "mentioned budget approval", "ready to sign")

--- Thread-level tags ---
Return an array of patterns observed across the full conversation. Each pattern:
- pattern: short label for the thread-level signal (e.g. "strong buying intent", "multi-stakeholder expansion", "competitive evaluation", "urgency driven by compliance deadline")
- score: float 0.0–1.0 (how strongly this pattern is present in the thread)
- closeLikelihood: float 0.0–1.0 — include ONLY on the single most important pattern; omit on all others

--- Product ---
Extract the product or solution name being discussed (e.g. "Sophos XDR", "Microsoft 365", "AWS S3"). Use the exact name as mentioned in the thread. Omit if unclear.

--- Main contact ---
Identify the primary prospect contact (the person the seller is selling to, not the seller). Use their full name as it appears in the thread (e.g. "Legolas Greenleaf"). Omit if unclear.

--- Response format ---
Return a JSON object with exactly these keys:
{
  "tags": [ [/* tags for message 1 */], [/* tags for message 2 */], ... ],
  "threadTags": [ { "pattern": "...", "score": 0.9, "closeLikelihood": 0.85 }, { "pattern": "...", "score": 0.7 } ],
  "product": "Sophos XDR",
  "mainContact": "Legolas Greenleaf"
}

The "tags" array must have exactly one element per input message, in the same order.`;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = AnalyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { messages } = parsed.data;

  const userContent = JSON.stringify(
    messages.map((m) => ({
      id: m.id,
      from: m.from.emailAddress.name,
      bodyPreview: m.bodyPreview,
    })),
  );

  const groq = getGroqClient();
  let completion;
  try {
    completion = await groq.chat.completions.create({
      model: env.GROQ_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    });
  } catch (error) {
    console.error("[analyze] Groq API error", error);
    return NextResponse.json({ error: "AI service unavailable" }, { status: 502 });
  }

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    return NextResponse.json({ error: "Empty AI response" }, { status: 502 });
  }

  let groqResult;
  try {
    groqResult = GroqTagsResponseSchema.parse(JSON.parse(raw));
  } catch {
    console.error("[analyze] Groq response failed Zod validation", raw);
    return NextResponse.json(
      { error: "Unexpected AI response shape" },
      { status: 502 },
    );
  }

  const taggedMessages = messages.map((msg, i) => ({
    ...msg,
    tags: groqResult.tags[i] ?? [],
  }));

  const response = AnalyzeResponseSchema.parse({
    messages: taggedMessages,
    threadTags: groqResult.threadTags,
    product: groqResult.product,
    mainContact: groqResult.mainContact,
  });

  return NextResponse.json(response);
}
