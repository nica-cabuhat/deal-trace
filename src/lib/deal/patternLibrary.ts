import rawMessages from "@/lib/data/threads.json";
import { groupIntoThreads } from "@/lib/graph/groupThreads";
import type { EmailMessage, EmailThread } from "@/lib/types/thread";

type Outcome = "won" | "lost" | "stalled";

interface DealPattern {
  subject: string;
  product: string | undefined;
  outcome: Outcome;
  messageCount: number;
  finalQuote: string;
  behaviors: string[];
}

const SELLER_DOMAIN = "sophos.com";

const WON_INDICATORS =
  /\b(execute the contract|order form|sign|PO\b|purchase order|approved|proceed|budget approved|begin immediately|send the order|ready to sign|PO is incoming|PO coming|countersigned)\b/i;

const LOST_INDICATORS =
  /\b(different direction|another vendor|going with|chose .+?(crowdstrike|sentinelone|competitor)|not interested|don't contact|matter is closed|decided to build|in-house|staying with our current|pause new security|decided to go in a different)\b/i;

const PRODUCT_RE =
  /\bSophos\s+(Intercept\s*X|MDR|XDR|Firewall|Central|Endpoint|Email|ZTNA|Cloud\s*(?:Optix|Security))\b/i;

function extractProduct(thread: EmailThread): string | undefined {
  const text = thread.messages.map((m) => m.subject + " " + m.bodyPreview).join(" ");
  const match = text.match(PRODUCT_RE);
  return match ? `Sophos ${match[1]}` : undefined;
}

function classifyOutcome(thread: EmailThread): Outcome {
  const last3 = thread.messages.slice(-3);
  const text = last3.map((m) => m.bodyPreview).join(" ");

  if (WON_INDICATORS.test(text)) return "won";
  if (LOST_INDICATORS.test(text)) return "lost";

  const lastMsg = thread.messages[thread.messages.length - 1];
  if (lastMsg?.from.emailAddress.address.includes(SELLER_DOMAIN)) {
    const last2Seller = thread.messages.slice(-2).every((m) =>
      m.from.emailAddress.address.includes(SELLER_DOMAIN),
    );
    if (last2Seller) return "stalled";
  }

  return "stalled";
}

function extractBehaviors(thread: EmailThread, outcome: Outcome): string[] {
  const behaviors: string[] = [];
  const uniqueProspectNames = new Set(
    thread.messages
      .filter((m) => !m.from.emailAddress.address.includes(SELLER_DOMAIN))
      .map((m) => m.from.emailAddress.name),
  );

  if (uniqueProspectNames.size > 1) {
    behaviors.push(`multi-threaded: ${uniqueProspectNames.size} prospect contacts engaged`);
  }

  const text = thread.messages.map((m) => m.bodyPreview).join(" ");
  if (/\b(CISO|CTO|CIO|board|executive|general counsel|director)\b/i.test(text)) {
    behaviors.push("executive stakeholder involved");
  }
  if (/\b(budget|pricing|cost|TCO|ROI|invest)\b/i.test(text)) {
    behaviors.push("pricing/budget discussed");
  }
  if (/\b(competitor|crowdstrike|sentinelone|palo alto|fortinet)\b/i.test(text)) {
    behaviors.push("competitor mentioned");
  }
  if (/\b(compliance|FedRAMP|SOC\s*2|GDPR|PCI|CMMC|CJIS|FISMA|HIPAA)\b/i.test(text)) {
    behaviors.push("compliance/regulatory driver");
  }
  if (/\b(urgent|immediately|fast.?track|asap|can't afford|deadline)\b/i.test(text)) {
    behaviors.push("urgency/time pressure present");
  }

  if (outcome === "stalled") {
    const sellerFollowUps = thread.messages.filter((m) =>
      m.from.emailAddress.address.includes(SELLER_DOMAIN),
    );
    if (sellerFollowUps.length >= 3 && thread.messages.length - sellerFollowUps.length <= 2) {
      behaviors.push("prospect went silent after initial engagement");
    }
  }

  return behaviors;
}

function buildPatterns(): DealPattern[] {
  const threads = groupIntoThreads(rawMessages as unknown as EmailMessage[]);

  return threads.map((thread) => {
    const outcome = classifyOutcome(thread);
    const lastMsg = thread.messages[thread.messages.length - 1];

    return {
      subject: thread.subject,
      product: extractProduct(thread),
      outcome,
      messageCount: thread.messages.length,
      finalQuote: lastMsg?.bodyPreview.slice(0, 120) ?? "",
      behaviors: extractBehaviors(thread, outcome),
    };
  });
}

let cached: DealPattern[] | null = null;

function getPatterns(): DealPattern[] {
  if (!cached) cached = buildPatterns();
  return cached;
}

export interface PatternStats {
  total: number;
  won: number;
  lost: number;
  stalled: number;
}

export function getPatternStats(): PatternStats {
  const patterns = getPatterns();
  return {
    total: patterns.length,
    won: patterns.filter((p) => p.outcome === "won").length,
    lost: patterns.filter((p) => p.outcome === "lost").length,
    stalled: patterns.filter((p) => p.outcome === "stalled").length,
  };
}

export function getPatternContext(): string {
  const patterns = getPatterns();
  const stats = getPatternStats();

  const wonDeals = patterns.filter((p) => p.outcome === "won");
  const lostDeals = patterns.filter((p) => p.outcome === "lost");
  const stalledDeals = patterns.filter((p) => p.outcome === "stalled");

  const formatDeal = (p: DealPattern) => {
    const product = p.product ?? "Sophos";
    const beh = p.behaviors.length > 0 ? p.behaviors.join(", ") : "standard engagement";
    return `- "${p.subject}" [${product}] (${p.messageCount} msgs) — Final: "${p.finalQuote}"\n  Behaviors: ${beh}`;
  };

  return [
    `--- Historical Deal Intelligence ---`,
    `Derived from ${stats.total} concluded deals: ${stats.won} won, ${stats.lost} lost, ${stats.stalled} stalled.`,
    `Use these REAL patterns from the seller's own deal history to calibrate your scoring.`,
    `Deals showing signals similar to won patterns should score higher.`,
    `Deals showing signals similar to lost patterns should score lower.`,
    ``,
    `WON DEALS (${stats.won}):`,
    wonDeals.map(formatDeal).join("\n"),
    ``,
    `LOST DEALS (${stats.lost}):`,
    lostDeals.map(formatDeal).join("\n"),
    ``,
    `STALLED DEALS (${stats.stalled}):`,
    stalledDeals.map(formatDeal).join("\n"),
    ``,
    `--- Key Winning Patterns ---`,
    `- Multi-threaded engagement (looping in technical + executive stakeholders)`,
    `- Fast response to objections (same day or next day)`,
    `- Compliance documentation ready before prospect asks`,
    `- Board-ready materials provided proactively`,
    `- Clear urgency from prospect (regulatory deadline, recent incident, EOL)`,
    ``,
    `--- Key Losing Patterns ---`,
    `- Competitor explicitly preferred for specific capability`,
    `- Legal/contractual blockers that couldn't be resolved`,
    `- Budget objection not resolved with flexible scope`,
    `- Champion departed or reassigned mid-deal`,
    `- Prospect went silent after initial interest (no multi-threading)`,
    `--- End Historical Context ---`,
  ].join("\n");
}
