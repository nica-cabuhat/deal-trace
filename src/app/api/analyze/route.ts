import { NextResponse } from "next/server";
import { getGroqClient } from "@/lib/groq/client";
import {
  AnalyzeRequestSchema,
  AnalyzeResponseSchema,
  GroqTagsResponseSchema,
} from "@/lib/schemas/analyze.schema";
import { env } from "@/lib/schemas/env.schema";
import type { EmailMessage } from "@/lib/types/thread";

const PRODUCT_PATTERNS: Array<{ re: RegExp; product: string }> = [
  { re: /\bSophos\s+Intercept\s*X\b/i, product: "Sophos Intercept X" },
  { re: /\bSophos\s+MDR\b/i, product: "Sophos MDR" },
  { re: /\bSophos\s+XDR\b/i, product: "Sophos XDR" },
  { re: /\bSophos\s+Firewall\b/i, product: "Sophos Firewall" },
  { re: /\bSophos\s+Central\b/i, product: "Sophos Central" },
  { re: /\bSophos\s+Endpoint\b/i, product: "Sophos Endpoint" },
  { re: /\bSophos\s+Email\b/i, product: "Sophos Email" },
  { re: /\bSophos\s+ZTNA\b/i, product: "Sophos ZTNA" },
  { re: /\bSophos\s+Cloud\b/i, product: "Sophos Cloud Security" },
];

/**
 * Deterministic product extraction — check subject first, then body text.
 * Only returns a match for specific product names (e.g. "Sophos XDR"),
 * NOT the generic word "Sophos" alone — the LLM handles ambiguous cases.
 */
function extractProductFromMessages(messages: EmailMessage[]): string | undefined {
  const subjectText = messages.map((m) => m.subject).join(" ");
  for (const { re, product } of PRODUCT_PATTERNS) {
    if (re.test(subjectText)) return product;
  }
  const bodyText = messages.map((m) => m.bodyPreview).join(" ");
  for (const { re, product } of PRODUCT_PATTERNS) {
    if (re.test(bodyText)) return product;
  }
  return undefined;
}

const SYSTEM_PROMPT = `You are a sales intelligence engine. You will receive a structured email thread between a SELLER and one or more PROSPECTS. The seller's email domain will be identified. Analyze the thread and return:

1. Per-message tags — behavioral signals for each individual message
2. Thread-level tags — patterns observed across the full conversation arc
3. Product — the product or solution being discussed
4. Main contact — the primary prospect contact (NOT the seller)

You MUST pay close attention to WHO is saying WHAT. Signals from prospects and signals from the seller carry different meaning.

--- Identifying the Seller ---
The seller is the person initiating the thread. Their email domain is typically a vendor domain (e.g. "@sophos.com"). Other participants are prospects.

--- Per-message tags ---
For each message return an array of tags. Each tag:
- signal: concise phrase describing the behavior (e.g. "CISO approved proposal", "raised pricing objection and mentioned competitor")
- confidence: float 0.0–1.0
- category: one of "engagement", "urgency", "sentiment", "intent"
- direction: one of "positive", "negative", "neutral"

Direction classification rules:
  POSITIVE = any action (prospect OR seller) that moves the deal forward:
    Prospect: "expressed strong interest", "requested proposal", "looped in decision maker", "CISO approved", "budget approved", "asked for pricing", "scheduled meeting", "attached order form", "ready to sign", "confirmed requirements met", "sent order form", "procurement engaged", "mentioned relevant pain point"
    Seller: "sent proposal/pricing", "scheduled call/meeting", "provided compliance documentation", "sent technical datasheet", "followed up on proposal", "initiated onboarding", "attached order form", "provided ROI analysis", "arranged demo"
  NEGATIVE = action that blocks, stalls, or kills the deal:
    "raised pricing objection", "mentioned competitor favorably", "expressed decision to not purchase", "said don't contact us", "went silent", "canceled meeting", "budget frozen", "chose another vendor", "expressed hesitation about product", "pushed back on timeline", "no clear resolution to objections", "ghosted after proposal"
  NEUTRAL = purely informational with no deal impact:
    "asked clarifying question about logistics", "introduced new stakeholder without context"
  
  IMPORTANT: Seller actions that advance the deal (sending proposals, scheduling calls, providing documentation) are ALWAYS "positive", NOT "neutral". Only classify as "neutral" if the action has zero deal progression impact.

CRITICAL: These signals are ALWAYS "negative" with confidence >= 0.95:
  - Prospect explicitly declines to purchase ("We've decided to go with another vendor", "We're not interested", "Don't contact us again")
  - Prospect raises pricing objection AND mentions a competitor in the same message
  - Prospect cancels a scheduled meeting or demo
  - Prospect goes silent for 2+ weeks after receiving a proposal

These signals are ALWAYS "positive" with confidence >= 0.9:
  - Prospect approves budget or proposal
  - Prospect says "ready to sign" or requests order form
  - Prospect loops in executive or decision maker
  - Prospect confirms compliance/technical requirements are met

--- Thread-level tags ---
Assess the OVERALL trajectory of the conversation. Return 2–4 patterns. Each:
- pattern: short label (e.g. "strong buying intent", "deal lost — prospect chose competitor")
- score: 0.0–1.0 (strength of this pattern — a high score on a negative pattern means strongly negative)
- direction: "positive", "negative", or "neutral"
- closeLikelihood: float 0.0–1.0 — include ONLY on the single pattern that best represents the overall deal outcome; omit on others

Thread-level direction rules:
  If the prospect explicitly declined/rejected at ANY point (especially the final messages), the primary thread tag MUST be "negative" with closeLikelihood < 0.2.
  If the prospect signed, sent an order form, or explicitly confirmed purchase, the primary tag MUST be "positive" with closeLikelihood > 0.8.
  The FINAL messages in the thread carry the most weight for thread-level assessment.

--- Product ---
Extract the product/solution name. Check the email SUBJECT LINE first — it often contains the product (e.g. "Sophos MDR for Legal" → "Sophos MDR", "Ransomware Protection for Healthcare — Sophos Intercept X" → "Sophos Intercept X"). Fall back to the body text. Use the most specific product name mentioned. Omit only if truly unclear.

--- Main contact ---
The primary PROSPECT contact (the person being sold to, NOT the seller). Use their full name as it appears in the thread. Omit if unclear.

--- Response format ---
{
  "tags": [ [{ "signal": "...", "confidence": 0.9, "category": "intent", "direction": "positive" }], ... ],
  "threadTags": [ { "pattern": "...", "score": 0.95, "direction": "positive", "closeLikelihood": 0.9 }, { "pattern": "...", "score": 0.7, "direction": "negative" } ],
  "product": "Sophos XDR",
  "mainContact": "Legolas Greenleaf"
}

The "tags" array MUST have exactly one element per input message, in the same order as the input.`;

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

  console.log(
    `[analyze] Thread: "${messages[0]?.subject}" (${messages.length} messages)`,
  );

  const userContent = JSON.stringify(
    messages.map((m, i) => ({
      index: i,
      subject: m.subject,
      from: `${m.from.emailAddress.name} <${m.from.emailAddress.address}>`,
      date: m.receivedDateTime,
      body: m.bodyPreview,
    })),
  );

  const groq = getGroqClient();
  let completion;
  try {
    completion = await groq.chat.completions.create({
      model: env.GROQ_MODEL,
      response_format: { type: "json_object" },
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Analyze this email thread and respond in json:\n${userContent}` },
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

  const deterministicProduct = extractProductFromMessages(messages);

  console.log(
    `[analyze] Result — LLM product: "${groqResult.product}", deterministic: "${deterministicProduct}", mainContact: "${groqResult.mainContact}"`,
  );

  const response = AnalyzeResponseSchema.parse({
    messages: taggedMessages,
    threadTags: groqResult.threadTags,
    product: deterministicProduct ?? groqResult.product,
    mainContact: groqResult.mainContact,
  });

  return NextResponse.json(response);
}
