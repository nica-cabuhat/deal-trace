import { NextResponse } from "next/server";
import { getGroqClient } from "@/lib/groq/client";
import { ScoreRequestSchema, GroqScoreResponseSchema, ScoreResponseSchema } from "@/lib/schemas/score.schema";
import { env } from "@/lib/schemas/env.schema";
import { getPatternContext } from "@/lib/deal/patternLibrary";
import type { EmailThread } from "@/lib/types/thread";

const ACTIVE_PROMPT = `You are a won/loss divergence engine for B2B sales deals. Given a tagged email thread with behavioral signals, compute a deal health score.

You MUST read ALL messages and their tags carefully, paying special attention to the FINAL messages — they carry the most weight.

--- Health Score ---
Compute an integer from 0–100.

SCORING RULES (apply in order):

1. TERMINAL NEGATIVE — if the prospect explicitly declined, rejected, chose a competitor, or said "don't contact us" in ANY message (especially the last), the score MUST be 5–20 regardless of earlier positive signals. A deal that ended in rejection is NOT healthy.

2. TERMINAL POSITIVE — if the prospect signed, sent an order form, confirmed purchase, or said "ready to sign" in the final messages, the score MUST be 80–98.

3. If neither terminal condition applies, use this framework:
   - Start from closeLikelihood × 100 if present (thread-level tags)
   - Positive thread patterns (direction: "positive") push score up, weighted by their score value
   - Negative thread patterns (direction: "negative") push score down, weighted by their score value
   - Message-level signals reinforce: positive high-confidence tags add, negative high-confidence tags subtract
   - RECENCY RULE: signals in the last 2 messages weigh 3x more than earlier signals
   - A pricing objection + competitor mention together = at least -20 from baseline

4. CONSISTENCY CHECK: If riskFactors include "expressed decision to not purchase", "chose competitor", or "deal lost", the healthScore MUST be < 25.

--- Prediction ---
- "on_track": healthScore >= 65
- "at_risk": healthScore 35–64
- "critical": healthScore < 35

--- Win Factors ---
List 2–4 specific things from this thread working in favor of closing. Reference actual prospect actions and signals.

--- Risk Factors ---
List 2–4 specific risks threatening the deal. Reference actual prospect statements.

--- Recommendations ---
List 3–5 actionable next steps the sales rep should take RIGHT NOW. Be specific to this deal.

--- Draft Email (if requested) ---
Write a short (3–5 sentence) professional email from the seller to the main contact.
- If the deal is healthy: acknowledge progress, address biggest risk, include call to action
- If the deal is lost: thank them for their time, leave door open professionally, suggest future check-in
- Sound natural, not templated

--- Response Format ---
{
  "healthScore": 72,
  "prediction": "on_track",
  "winFactors": ["CISO approved the proposal", "strong urgency from EOL deadline"],
  "riskFactors": ["IT director has unresolved technical questions", "no procurement timeline confirmed"],
  "recommendations": ["Send a TCO comparison document", "Schedule a technical deep-dive with IT director"],
  "draftEmail": "Hi [Name], ..."
}`;

const RETROSPECTIVE_PROMPT = `You are a deal post-mortem analyst for B2B sales. This email thread represents a CONCLUDED deal — it is already over. Your job is to analyze it retrospectively as a case study.

Read ALL messages carefully and determine the outcome: did the deal close successfully (won) or did the prospect decline/go silent/choose a competitor (lost)?

--- Outcome ---
Classify as "won" or "lost" based on the final messages.

--- Health Score ---
Compute a retrospective score 0–100 reflecting how well the deal was executed overall.
- Won deals with smooth execution: 85–98
- Won deals with significant friction: 65–84
- Lost deals where the rep performed well but lost on external factors: 30–50
- Lost deals due to rep mistakes or poor execution: 5–29

--- Prediction ---
- "on_track" if won
- "at_risk" if lost due to external factors
- "critical" if lost due to execution failures

--- Win Factors (what helped) ---
List 2–4 things the sales rep did WELL in this deal (past tense). These are lessons to REPEAT in future deals.
Examples: "Built multi-threaded relationship by engaging both CISO and IT director", "Responded to pricing objection within 2 hours with TCO comparison"

--- Risk Factors (what hurt) ---
List 2–4 things that went WRONG or could have been done better (past tense). These are lessons to AVOID.
Examples: "Failed to address competitor comparison early enough", "Lost momentum with 5-day gap between follow-ups"

--- Recommendations (lessons learned) ---
List 3–5 takeaways for future deals. Frame as reusable advice, NOT next steps for this deal (it's over).
Examples: "When a prospect mentions a competitor, address it in the same email — don't wait", "Always confirm procurement timeline before sending a proposal"

--- Response Format ---
{
  "healthScore": 85,
  "prediction": "on_track",
  "outcome": "won",
  "winFactors": ["Quickly addressed technical concerns from IT director", "Provided compelling TCO comparison"],
  "riskFactors": ["Slow follow-up after initial meeting created a 5-day gap", "Did not proactively address competitor pricing"],
  "recommendations": ["Always confirm budget authority before deep-dive meetings", "Send follow-up materials within 24 hours of every call"]
}`;

function buildThreadSummary(thread: EmailThread, includeDraft: boolean): string {
  const threadTagSummary = thread.threadTags?.map((t) =>
    `  - [${t.direction.toUpperCase()}] "${t.pattern}" (score: ${Math.round(t.score * 100)}%${t.closeLikelihood !== undefined ? `, closeLikelihood: ${Math.round(t.closeLikelihood * 100)}%` : ""})`
  ).join("\n") ?? "  (none)";

  const messageSummary = thread.messages.map((m, i) => {
    const tags = m.tags?.map((t) =>
      `    · [${t.direction}] ${t.signal} (${t.category}, ${Math.round(t.confidence * 100)}%)`
    ).join("\n") ?? "";
    return `  Message ${i + 1} from ${m.from.emailAddress.name}:\n    Preview: "${m.bodyPreview}"\n${tags}`;
  }).join("\n\n");

  return [
    `Subject: ${thread.subject}`,
    `Product: ${thread.product ?? "unknown"}`,
    `Main contact: ${thread.mainContact ?? "unknown"}`,
    `Total messages: ${thread.messages.length}`,
    `\nThread patterns:\n${threadTagSummary}`,
    `\nMessages with signals:\n${messageSummary}`,
    `\nGenerate draft email: ${includeDraft ? "yes" : "no"}`,
  ].join("\n");
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ScoreRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { thread, includeDraft = false, retrospective = false } = parsed.data;

  const summary = buildThreadSummary(thread, includeDraft);
  const patternContext = retrospective ? "" : getPatternContext();
  const prompt = retrospective
    ? RETROSPECTIVE_PROMPT
    : `${patternContext}\n\n${ACTIVE_PROMPT}`;
  const userMsg = retrospective
    ? `Analyze this concluded deal thread as a case study and respond in json:\n${summary}`
    : `Score this deal thread and respond in json:\n${summary}`;

  console.log(
    `[score] Thread: "${thread.subject}" | product: "${thread.product}" | retrospective: ${retrospective} | messages: ${thread.messages.length}`,
  );

  const groq = getGroqClient();
  let completion;
  try {
    completion = await groq.chat.completions.create({
      model: env.GROQ_MODEL,
      response_format: { type: "json_object" },
      temperature: 0,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: userMsg },
      ],
    });
  } catch (error) {
    console.error("[score] Groq API error", error);
    return NextResponse.json({ error: "AI service unavailable" }, { status: 502 });
  }

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    return NextResponse.json({ error: "Empty AI response" }, { status: 502 });
  }

  let groqResult;
  try {
    groqResult = GroqScoreResponseSchema.parse(JSON.parse(raw));
  } catch {
    console.error("[score] Groq response failed Zod validation", raw);
    return NextResponse.json({ error: "Unexpected AI response shape" }, { status: 502 });
  }

  console.log(
    `[score] Result — "${thread.subject}" → healthScore: ${groqResult.healthScore}, prediction: ${groqResult.prediction}`,
  );

  return NextResponse.json(ScoreResponseSchema.parse(groqResult));
}
