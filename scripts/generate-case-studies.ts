/**
 * One-time script to generate cached case study results for all static threads.
 * Run: npx tsx scripts/generate-case-studies.ts
 *
 * Requires GROQ_API_KEY and GROQ_MODEL in .env.local
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import Groq from "groq-sdk";

const __scriptDir = dirname(fileURLToPath(import.meta.url));

// ── Load env vars from .env.local ───────────────────────────────────────────
const envPath = resolve(__scriptDir, "..", ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const envVars: Record<string, string> = {};
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  envVars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
}

const GROQ_API_KEY = envVars.GROQ_API_KEY;
const GROQ_MODEL = envVars.GROQ_MODEL;
if (!GROQ_API_KEY || !GROQ_MODEL) {
  console.error("Missing GROQ_API_KEY or GROQ_MODEL in .env.local");
  process.exit(1);
}

const groq = new Groq({ apiKey: GROQ_API_KEY });

// ── Types (inline to avoid path alias issues) ───────────────────────────────
interface EmailAddress {
  name: string;
  address: string;
}
interface EmailSender {
  emailAddress: EmailAddress;
}
interface EmailTag {
  signal: string;
  confidence: number;
  category: "engagement" | "urgency" | "sentiment" | "intent";
  direction: "positive" | "negative" | "neutral";
}
interface EmailMessage {
  id: string;
  conversationId: string;
  subject: string;
  from: EmailSender;
  receivedDateTime: string;
  bodyPreview: string;
  tags?: EmailTag[];
}
interface ThreadTag {
  pattern: string;
  score: number;
  direction: "positive" | "negative" | "neutral";
  closeLikelihood?: number;
}
interface EmailThread {
  conversationId: string;
  subject: string;
  messages: EmailMessage[];
  threadTags?: ThreadTag[];
  product?: string;
  mainContact?: string;
}
interface ThreadHealth {
  healthScore: number;
  prediction: "on_track" | "at_risk" | "critical";
  outcome?: "won" | "lost" | "active";
  winFactors: string[];
  riskFactors: string[];
  recommendations: string[];
}
interface CaseStudy {
  conversationId: string;
  subject: string;
  product?: string;
  mainContact?: string;
  threadTags: ThreadTag[];
  messages: EmailMessage[];
  health: ThreadHealth;
}

// ── Group flat messages into threads ────────────────────────────────────────
function groupIntoThreads(messages: EmailMessage[]): EmailThread[] {
  const map = new Map<string, EmailThread>();
  for (const msg of messages) {
    const existing = map.get(msg.conversationId);
    if (existing) {
      existing.messages.push(msg);
    } else {
      map.set(msg.conversationId, {
        conversationId: msg.conversationId,
        subject: msg.subject.replace(/^Re:\s*/i, ""),
        messages: [msg],
      });
    }
  }
  return Array.from(map.values());
}

// ── Prompts (copied from API routes) ────────────────────────────────────────
const ANALYZE_PROMPT = `You are a sales intelligence engine. You will receive a structured email thread between a SELLER and one or more PROSPECTS. The seller's email domain will be identified. Analyze the thread and return:

1. Per-message tags — behavioral signals for each individual message
2. Thread-level tags — patterns observed across the full conversation arc
3. Product — the product or solution being discussed
4. Main contact — the primary prospect contact (NOT the seller)

You MUST pay close attention to WHO is saying WHAT. Signals from prospects and signals from the seller carry different meaning.

--- Identifying the Seller ---
The seller is the person initiating the thread. Their email domain is typically a vendor domain (e.g. "@sophos.com"). Other participants are prospects.

--- Per-message tags ---
For each message return an array of tags. Each tag:
- signal: concise phrase describing the behavior
- confidence: float 0.0–1.0
- category: one of "engagement", "urgency", "sentiment", "intent"
- direction: one of "positive", "negative", "neutral"

--- Thread-level tags ---
Assess the OVERALL trajectory. Return 2–4 patterns. Each:
- pattern: short label
- score: 0.0–1.0
- direction: "positive", "negative", or "neutral"
- closeLikelihood: float 0.0–1.0 — include ONLY on the single best-representing pattern; omit on others

--- Response format ---
{
  "tags": [ [{ "signal": "...", "confidence": 0.9, "category": "intent", "direction": "positive" }], ... ],
  "threadTags": [ { "pattern": "...", "score": 0.95, "direction": "positive", "closeLikelihood": 0.9 } ],
  "product": "Sophos XDR",
  "mainContact": "Legolas Greenleaf"
}

The "tags" array MUST have exactly one element per input message, in the same order as the input.`;

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

--- Risk Factors (what hurt) ---
List 2–4 things that went WRONG or could have been done better (past tense). These are lessons to AVOID.

--- Recommendations (lessons learned) ---
List 3–5 takeaways for future deals. Frame as reusable advice, NOT next steps for this deal (it's over).

--- Response Format ---
{
  "healthScore": 85,
  "prediction": "on_track",
  "outcome": "won",
  "winFactors": ["..."],
  "riskFactors": ["..."],
  "recommendations": ["..."]
}`;

// ── Product extraction (deterministic) ──────────────────────────────────────
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

function extractProduct(messages: EmailMessage[]): string | undefined {
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

// ── Thread summary builder (for score prompt) ───────────────────────────────
function buildThreadSummary(thread: EmailThread): string {
  const threadTagSummary =
    thread.threadTags
      ?.map(
        (t) =>
          `  - [${t.direction.toUpperCase()}] "${t.pattern}" (score: ${Math.round(t.score * 100)}%${t.closeLikelihood !== undefined ? `, closeLikelihood: ${Math.round(t.closeLikelihood * 100)}%` : ""})`,
      )
      .join("\n") ?? "  (none)";

  const messageSummary = thread.messages
    .map((m, i) => {
      const tags =
        m.tags
          ?.map(
            (t) =>
              `    · [${t.direction}] ${t.signal} (${t.category}, ${Math.round(t.confidence * 100)}%)`,
          )
          .join("\n") ?? "";
      return `  Message ${i + 1} from ${m.from.emailAddress.name}:\n    Preview: "${m.bodyPreview}"\n${tags}`;
    })
    .join("\n\n");

  return [
    `Subject: ${thread.subject}`,
    `Product: ${thread.product ?? "unknown"}`,
    `Main contact: ${thread.mainContact ?? "unknown"}`,
    `Total messages: ${thread.messages.length}`,
    `\nThread patterns:\n${threadTagSummary}`,
    `\nMessages with signals:\n${messageSummary}`,
    `\nGenerate draft email: no`,
  ].join("\n");
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const threadsPath = resolve(__scriptDir, "..", "src", "lib", "data", "threads.json");
  const rawMessages: EmailMessage[] = JSON.parse(readFileSync(threadsPath, "utf-8"));
  const threads = groupIntoThreads(rawMessages);

  // Load existing results to support resume
  let existing: CaseStudy[] = [];
  const outPath = resolve(__scriptDir, "..", "src", "lib", "data", "case-studies.json");
  try {
    existing = JSON.parse(readFileSync(outPath, "utf-8"));
  } catch {
    // No existing file — start fresh
  }
  const doneIds = new Set(existing.map((c) => c.conversationId));

  const remaining = threads.filter((t) => !doneIds.has(t.conversationId));
  console.log(`${existing.length} already cached, ${remaining.length} remaining out of ${threads.length} total.\n`);

  if (remaining.length === 0) {
    console.log("All threads already cached. Nothing to do.");
    return;
  }

  const caseStudies: CaseStudy[] = [...existing];
  const RATE_LIMIT_DELAY = 3000;

  for (let i = 0; i < remaining.length; i++) {
    const thread = remaining[i];
    console.log(`[${i + 1}/${remaining.length}] "${thread.subject}" (${thread.messages.length} msgs)`);

    // Step 1: Analyze (tag messages + thread patterns)
    const analyzeContent = JSON.stringify(
      thread.messages.map((m, idx) => ({
        index: idx,
        subject: m.subject,
        from: `${m.from.emailAddress.name} <${m.from.emailAddress.address}>`,
        date: m.receivedDateTime,
        body: m.bodyPreview,
      })),
    );

    let analyzeResult: {
      tags: EmailTag[][];
      threadTags: ThreadTag[];
      product?: string;
      mainContact?: string;
    };

    try {
      const analyzeCompletion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        response_format: { type: "json_object" },
        temperature: 0,
        messages: [
          { role: "system", content: ANALYZE_PROMPT },
          { role: "user", content: `Analyze this email thread and respond in json:\n${analyzeContent}` },
        ],
      });

      const analyzeRaw = analyzeCompletion.choices[0]?.message?.content;
      if (!analyzeRaw) throw new Error("Empty analyze response");
      analyzeResult = JSON.parse(analyzeRaw);
    } catch (err) {
      console.error(`  ✗ Analyze failed:`, err);
      continue;
    }

    const taggedMessages = thread.messages.map((msg, idx) => ({
      ...msg,
      tags: analyzeResult.tags[idx] ?? [],
    }));

    const deterministicProduct = extractProduct(thread.messages);
    const product = deterministicProduct ?? analyzeResult.product;
    const mainContact = analyzeResult.mainContact;

    const analyzedThread: EmailThread = {
      ...thread,
      messages: taggedMessages,
      threadTags: analyzeResult.threadTags ?? [],
      product,
      mainContact,
    };

    console.log(`  ✓ Analyzed — product: "${product}", contact: "${mainContact}"`);

    await sleep(RATE_LIMIT_DELAY);

    // Step 2: Retrospective score
    const summary = buildThreadSummary(analyzedThread);
    let health: ThreadHealth;

    try {
      const scoreCompletion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        response_format: { type: "json_object" },
        temperature: 0,
        messages: [
          { role: "system", content: RETROSPECTIVE_PROMPT },
          { role: "user", content: `Analyze this concluded deal thread as a case study and respond in json:\n${summary}` },
        ],
      });

      const scoreRaw = scoreCompletion.choices[0]?.message?.content;
      if (!scoreRaw) throw new Error("Empty score response");
      health = JSON.parse(scoreRaw);
    } catch (err) {
      console.error(`  ✗ Score failed:`, err);
      continue;
    }

    console.log(`  ✓ Scored — ${health.outcome} (${health.healthScore}/100)`);

    caseStudies.push({
      conversationId: thread.conversationId,
      subject: thread.subject,
      product,
      mainContact,
      threadTags: analyzeResult.threadTags ?? [],
      messages: taggedMessages,
      health,
    });

    // Save incrementally so partial runs are preserved
    writeFileSync(outPath, JSON.stringify(caseStudies, null, 2));

    if (i < remaining.length - 1) {
      await sleep(RATE_LIMIT_DELAY);
    }
  }

  writeFileSync(outPath, JSON.stringify(caseStudies, null, 2));
  console.log(`\n✓ Saved ${caseStudies.length} case studies to src/lib/data/case-studies.json`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
