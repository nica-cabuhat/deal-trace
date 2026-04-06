/**
 * Deterministic case study generator — no LLM calls needed.
 * Extracts behavioral signals, classifies outcomes, and generates
 * case study data purely from thread content analysis.
 *
 * Run: npx tsx scripts/generate-case-studies-deterministic.ts
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __scriptDir = dirname(fileURLToPath(import.meta.url));

// ── Types ───────────────────────────────────────────────────────────────────
interface EmailAddress { name: string; address: string }
interface EmailSender { emailAddress: EmailAddress }
interface EmailTag {
  signal: string;
  confidence: number;
  category: "engagement" | "urgency" | "sentiment" | "intent";
  direction: "positive" | "negative" | "neutral";
}
interface EmailMessage {
  id: string; conversationId: string; subject: string;
  from: EmailSender; receivedDateTime: string; bodyPreview: string;
  tags?: EmailTag[];
}
interface ThreadTag {
  pattern: string; score: number;
  direction: "positive" | "negative" | "neutral";
  closeLikelihood?: number;
}
interface EmailThread {
  conversationId: string; subject: string; messages: EmailMessage[];
  threadTags?: ThreadTag[]; product?: string; mainContact?: string;
}
type Outcome = "won" | "lost" | "stalled";
interface ThreadHealth {
  healthScore: number;
  prediction: "on_track" | "at_risk" | "critical";
  outcome: Outcome;
  winFactors: string[];
  riskFactors: string[];
  recommendations: string[];
}
interface CaseStudy {
  conversationId: string; subject: string;
  product?: string; mainContact?: string;
  threadTags: ThreadTag[]; messages: EmailMessage[];
  health: ThreadHealth;
}

// ── Constants ───────────────────────────────────────────────────────────────
const SELLER_DOMAIN = "sophos.com";

const PRODUCT_PATTERNS: Array<{ re: RegExp; product: string }> = [
  { re: /\bSophos\s+Intercept\s*X\b/i, product: "Sophos Intercept X" },
  { re: /\bSophos\s+MDR\b/i, product: "Sophos MDR" },
  { re: /\bSophos\s+XDR\b/i, product: "Sophos XDR" },
  { re: /\bSophos\s+Firewall\b/i, product: "Sophos Firewall" },
  { re: /\bSophos\s+Central\b/i, product: "Sophos Central" },
  { re: /\bSophos\s+Endpoint\b/i, product: "Sophos Endpoint" },
  { re: /\bSophos\s+Email\b/i, product: "Sophos Email" },
  { re: /\bSophos\s+ZTNA\b/i, product: "Sophos ZTNA" },
  { re: /\bSophos\s+Cloud\s*(?:Optix|Security)?\b/i, product: "Sophos Cloud Security" },
];

const WON_RE = /\b(execute the contract|order form|send the order|PO\b|purchase order|approved|begin immediately|ready to sign|PO is incoming|PO coming|countersigned|send the contract|go-ahead|move forward|want to proceed|prepared to move|let's get this done|sending to procurement|on board|fully on board|get approval|present this|pilot agreement|begin onboarding|ready to move|signed off|we're in|let's proceed|green light|budget approved|we'll take it)\b/i;
const LOST_RE = /\b(different direction|another vendor|going with|chose .+?(crowdstrike|sentinelone|competitor)|not interested|don't contact|matter is closed|decided to build|in-house|staying with our current|pause new security|decided to go in a different|don't contact us again|cannot proceed|we've made our decision|close out this thread|no promises|will not be making)\b/i;

// ── Message-level signal detection ──────────────────────────────────────────
interface SignalPattern {
  re: RegExp;
  signal: string;
  category: EmailTag["category"];
  direction: EmailTag["direction"];
  confidence: number;
  prospectOnly?: boolean;
  sellerOnly?: boolean;
}

const SIGNAL_PATTERNS: SignalPattern[] = [
  // Prospect positive signals
  { re: /\b(interested|love|exactly what we need|tell me more)\b/i, signal: "expressed strong interest", category: "intent", direction: "positive", confidence: 0.9, prospectOnly: true },
  { re: /\b(schedule|set up a call|calendar|meeting|let's meet|demo)\b/i, signal: "requested meeting/demo", category: "engagement", direction: "positive", confidence: 0.85, prospectOnly: true },
  { re: /\b(loop.+in|I'll have|joining|introduce|forward)\b/i, signal: "looped in additional stakeholder", category: "engagement", direction: "positive", confidence: 0.9, prospectOnly: true },
  { re: /\b(CISO|CTO|CIO|board|director)\s.*(approved|signed off|satisfied|agreed|on board)\b/i, signal: "executive approved", category: "intent", direction: "positive", confidence: 0.95, prospectOnly: true },
  { re: /\b(budget|approved|PO|purchase order|procurement|order form|sign|contract)\b/i, signal: "purchase intent confirmed", category: "intent", direction: "positive", confidence: 0.95, prospectOnly: true },
  { re: /\b(urgent|immediately|fast.?track|asap|can't afford|deadline|must|critical)\b/i, signal: "expressed urgency", category: "urgency", direction: "positive", confidence: 0.85, prospectOnly: true },
  { re: /\b(pain\s*point|problem|concern|gap|risk|vulnerability|incident|breach|attack)\b/i, signal: "acknowledged relevant pain point", category: "sentiment", direction: "positive", confidence: 0.8, prospectOnly: true },
  { re: /\b(compliance|SOC\s*2|GDPR|FedRAMP|PCI|CMMC|CJIS|FISMA|audit)\b/i, signal: "compliance requirement identified", category: "intent", direction: "positive", confidence: 0.85, prospectOnly: true },
  { re: /\b(thumbs up|checks out|requirements met|documentation.*reviewed|satisfied)\b/i, signal: "technical validation passed", category: "intent", direction: "positive", confidence: 0.9, prospectOnly: true },
  // Prospect negative signals
  { re: /\b(different direction|another vendor|going with|decided|not interested|don't contact|closed|staying with|in-house|build our own)\b/i, signal: "declined to proceed", category: "intent", direction: "negative", confidence: 0.95, prospectOnly: true },
  { re: /\b(too high|above.*budget|can't make.*work|expensive|pricing objection)\b/i, signal: "raised pricing objection", category: "sentiment", direction: "negative", confidence: 0.9, prospectOnly: true },
  { re: /\b(crowdstrike|sentinelone|palo alto|fortinet|competitor)\b/i, signal: "mentioned competitor", category: "sentiment", direction: "negative", confidence: 0.8, prospectOnly: true },
  { re: /\b(pause|revisit|hold|later|next fiscal|next quarter|no authority)\b/i, signal: "deal deferred or stalled", category: "intent", direction: "negative", confidence: 0.8, prospectOnly: true },
  { re: /\b(reassigned|departed|taken over|new.*responsibilities)\b/i, signal: "champion change detected", category: "engagement", direction: "negative", confidence: 0.85, prospectOnly: true },
  { re: /\b(incompatible|unable to make|cannot proceed|clauses)\b/i, signal: "contractual/legal blocker", category: "intent", direction: "negative", confidence: 0.9, prospectOnly: true },
  // Seller signals
  { re: /\b(proposal|pricing|quote|TCO|ROI)\s*(attached|enclosed|included|sent)\b/i, signal: "sent proposal/pricing", category: "engagement", direction: "positive", confidence: 0.85, sellerOnly: true },
  { re: /\b(follow.?up|checking in|any update|still on your radar|last follow.?up)\b/i, signal: "follow-up sent", category: "engagement", direction: "positive", confidence: 0.7, sellerOnly: true },
  { re: /\b(schedule|set up a call|calendar|meeting|call with|demo)\b/i, signal: "scheduled call/meeting", category: "engagement", direction: "positive", confidence: 0.85, sellerOnly: true },
  { re: /\b(welcome to|onboarding|order form attached|countersigned)\b/i, signal: "deal closed — onboarding initiated", category: "intent", direction: "positive", confidence: 0.95, sellerOnly: true },
  { re: /\b(compliance|SOC\s*2|GDPR|FedRAMP|DPA|sub-processor|attestation|audit)\b/i, signal: "compliance documentation provided", category: "engagement", direction: "positive", confidence: 0.8, sellerOnly: true },
];

function tagMessage(msg: EmailMessage): EmailTag[] {
  const isSeller = msg.from.emailAddress.address.includes(SELLER_DOMAIN);
  const tags: EmailTag[] = [];
  const seen = new Set<string>();

  for (const pat of SIGNAL_PATTERNS) {
    if (pat.prospectOnly && isSeller) continue;
    if (pat.sellerOnly && !isSeller) continue;
    if (pat.re.test(msg.bodyPreview) && !seen.has(pat.signal)) {
      seen.add(pat.signal);
      tags.push({
        signal: pat.signal,
        confidence: pat.confidence,
        category: pat.category,
        direction: pat.direction,
      });
    }
  }

  if (tags.length === 0) {
    tags.push({
      signal: isSeller ? "outreach/follow-up" : "engaged in conversation",
      confidence: 0.6,
      category: "engagement",
      direction: isSeller ? "positive" : "neutral",
    });
  }

  return tags;
}

// ── Thread-level analysis ───────────────────────────────────────────────────
function classifyOutcome(thread: EmailThread): Outcome {
  const allText = thread.messages.map((m) => m.bodyPreview).join(" ");
  const last3 = thread.messages.slice(-3);
  const last3Text = last3.map((m) => m.bodyPreview).join(" ");

  // Check last 3 messages for explicit terminal signals
  if (LOST_RE.test(last3Text)) return "lost";
  if (WON_RE.test(last3Text)) return "won";

  // Check full thread for terminal signals (weaker weight but still relevant)
  if (LOST_RE.test(allText)) return "lost";
  if (WON_RE.test(allText)) return "won";

  // If last 2+ messages are all seller with no prospect reply → stalled
  const lastMsg = thread.messages[thread.messages.length - 1];
  if (lastMsg?.from.emailAddress.address.includes(SELLER_DOMAIN)) {
    const last2Seller = thread.messages.slice(-2).every((m) =>
      m.from.emailAddress.address.includes(SELLER_DOMAIN),
    );
    if (last2Seller) return "stalled";
  }

  return "stalled";
}

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

function extractMainContact(thread: EmailThread): string | undefined {
  const prospects = thread.messages.filter(
    (m) => !m.from.emailAddress.address.includes(SELLER_DOMAIN),
  );
  return prospects[0]?.from.emailAddress.name;
}

function buildThreadTags(thread: EmailThread, outcome: Outcome): ThreadTag[] {
  const tags: ThreadTag[] = [];
  const allText = thread.messages.map((m) => m.bodyPreview).join(" ");
  const prospectMsgs = thread.messages.filter(
    (m) => !m.from.emailAddress.address.includes(SELLER_DOMAIN),
  );
  const uniqueProspects = new Set(prospectMsgs.map((m) => m.from.emailAddress.name));

  if (outcome === "won") {
    tags.push({
      pattern: "deal closed successfully",
      score: 0.95,
      direction: "positive",
      closeLikelihood: 0.95,
    });
  } else if (outcome === "lost") {
    tags.push({
      pattern: "deal lost",
      score: 0.9,
      direction: "negative",
      closeLikelihood: 0.1,
    });
  } else {
    tags.push({
      pattern: "deal stalled — no response",
      score: 0.8,
      direction: "negative",
      closeLikelihood: 0.15,
    });
  }

  if (uniqueProspects.size > 1) {
    tags.push({
      pattern: "multi-threaded engagement",
      score: 0.85,
      direction: "positive",
    });
  }
  if (/\b(CISO|CTO|CIO|board|executive|general counsel|director)\b/i.test(allText)) {
    tags.push({
      pattern: "executive stakeholder involved",
      score: 0.8,
      direction: "positive",
    });
  }
  if (/\b(urgent|immediately|fast.?track|deadline|can't afford)\b/i.test(allText)) {
    tags.push({
      pattern: "urgency/time pressure",
      score: 0.8,
      direction: "positive",
    });
  }
  if (/\b(crowdstrike|sentinelone|palo alto|fortinet|competitor)\b/i.test(allText)) {
    tags.push({
      pattern: "competitive evaluation",
      score: 0.7,
      direction: "negative",
    });
  }

  return tags;
}

// ── Health score & analysis generation ──────────────────────────────────────
function generateHealth(thread: EmailThread, outcome: Outcome): ThreadHealth {
  const allText = thread.messages.map((m) => m.bodyPreview).join(" ");
  const prospectMsgs = thread.messages.filter(
    (m) => !m.from.emailAddress.address.includes(SELLER_DOMAIN),
  );
  const sellerMsgs = thread.messages.filter(
    (m) => m.from.emailAddress.address.includes(SELLER_DOMAIN),
  );
  const uniqueProspects = new Set(prospectMsgs.map((m) => m.from.emailAddress.name));
  const mainContact = extractMainContact(thread) ?? "the prospect";

  const winFactors: string[] = [];
  const riskFactors: string[] = [];
  const recommendations: string[] = [];

  // Analyze behavioral signals
  const hasMultiThread = uniqueProspects.size > 1;
  const hasExecutive = /\b(CISO|CTO|CIO|board|executive|general counsel|director)\b/i.test(allText);
  const hasCompliance = /\b(compliance|FedRAMP|SOC\s*2|GDPR|PCI|CMMC|CJIS|FISMA|audit)\b/i.test(allText);
  const hasCompetitor = /\b(crowdstrike|sentinelone|palo alto|fortinet|competitor)\b/i.test(allText);
  const hasUrgency = /\b(urgent|immediately|fast.?track|deadline|can't afford|near.?miss|incident|breach)\b/i.test(allText);
  const hasPriceObjection = /\b(too high|above.*budget|expensive|pricing objection|can't make.*numbers)\b/i.test(allText);
  const hasProposal = /\b(proposal|pricing|quote)\s*(attached|enclosed|included|sent)\b/i.test(allText);
  const hasChampionChange = /\b(reassigned|departed|taken over|new.*responsibilities)\b/i.test(allText);
  const hasContractBlocker = /\b(incompatible|unable to make|cannot proceed)\b/i.test(allText);
  const prospectWentSilent = sellerMsgs.length >= 3 && thread.messages.slice(-2).every(
    (m) => m.from.emailAddress.address.includes(SELLER_DOMAIN),
  );

  // Calculate response time patterns
  const firstSellerMsg = sellerMsgs[0];
  const firstProspectMsg = prospectMsgs[0];
  let fastInitialResponse = false;
  if (firstSellerMsg && firstProspectMsg) {
    const diffHours = (new Date(firstProspectMsg.receivedDateTime).getTime() -
      new Date(firstSellerMsg.receivedDateTime).getTime()) / (1000 * 60 * 60);
    fastInitialResponse = diffHours < 24;
  }

  // ── WON deals ─────────────────────────────────────────────────────────────
  if (outcome === "won") {
    if (hasMultiThread) winFactors.push(`Built multi-threaded relationship by engaging ${uniqueProspects.size} stakeholders (${[...uniqueProspects].join(", ")})`);
    if (fastInitialResponse) winFactors.push(`${mainContact} responded within hours, indicating strong interest from the outset`);
    if (hasExecutive) winFactors.push("Gained executive sponsorship early, which accelerated procurement approval");
    if (hasCompliance) winFactors.push("Pre-emptively addressed compliance requirements with documentation before prospect asked");
    if (hasUrgency) winFactors.push("Leveraged prospect's urgency (deadline/incident) to maintain deal momentum");
    if (hasProposal) winFactors.push("Delivered proposal promptly, keeping the sales cycle short and focused");

    if (winFactors.length < 2) {
      winFactors.push("Maintained consistent communication throughout the sales cycle");
      winFactors.push("Aligned solution positioning with prospect's specific pain points");
    }

    // What could have been better even in a won deal
    if (!hasMultiThread) riskFactors.push("Single-threaded engagement — deal depended on one contact, increasing risk");
    if (hasCompetitor) riskFactors.push("Competitor was mentioned during evaluation, creating pressure on differentiation");
    if (hasPriceObjection) riskFactors.push("Pricing objection arose mid-deal, requiring scope adjustments");
    if (riskFactors.length === 0) {
      riskFactors.push("No significant risks materialized in this deal");
      riskFactors.push("Consider whether the smooth process was replicable or circumstantial");
    }

    recommendations.push("Replicate multi-stakeholder engagement pattern — loop in technical and executive contacts early");
    recommendations.push("Continue providing compliance/regulatory documentation proactively before prospects request it");
    if (hasUrgency) recommendations.push("When prospects have external deadlines, align all deliverables to their timeline — this accelerates close");
    recommendations.push("Document the winning playbook from this deal for similar industry verticals");
    if (recommendations.length < 4) recommendations.push("Set internal SLA for proposal delivery: same day or next business day");
  }

  // ── LOST deals ────────────────────────────────────────────────────────────
  else if (outcome === "lost") {
    // What went wrong
    if (hasCompetitor) riskFactors.push("Competitor was explicitly preferred — differentiation messaging was insufficient");
    if (hasPriceObjection) riskFactors.push("Pricing objection was not resolved despite scope adjustment attempts");
    if (hasContractBlocker) riskFactors.push("Legal/contractual requirements could not be met, creating an unresolvable blocker");
    if (hasChampionChange) riskFactors.push("Internal champion departed mid-deal, disrupting momentum and relationship");
    if (prospectWentSilent) riskFactors.push("Prospect went silent after initial engagement — no response to follow-ups");
    if (!hasMultiThread) riskFactors.push("Single-threaded engagement meant losing one contact derailed the entire deal");

    if (riskFactors.length < 2) {
      riskFactors.push("Failed to establish enough urgency or differentiation to close");
      riskFactors.push("Deal lost momentum in the middle stages without clear recovery action");
    }

    // What was done well despite the loss
    if (hasProposal) winFactors.push("Delivered a thorough proposal with detailed pricing and scope");
    if (fastInitialResponse) winFactors.push("Engaged quickly after initial contact, demonstrating responsiveness");
    if (hasCompliance) winFactors.push("Provided comprehensive compliance documentation proactively");
    if (hasMultiThread) winFactors.push("Successfully engaged multiple stakeholders during the evaluation");
    if (winFactors.length < 2) {
      winFactors.push("Maintained professional persistence throughout the sales cycle");
      winFactors.push("Followed up consistently without being pushy");
    }

    if (hasCompetitor) recommendations.push("When a competitor is mentioned, address differentiation in the same email — don't wait for a separate conversation");
    if (hasPriceObjection) recommendations.push("Present ROI/TCO comparisons proactively before pricing objections arise");
    if (hasChampionChange) recommendations.push("Always build relationships with multiple contacts — single-threading is a critical risk");
    if (hasContractBlocker) recommendations.push("Identify legal/contractual requirements in the first meeting to avoid late-stage blockers");
    if (prospectWentSilent) recommendations.push("If a prospect goes silent for 5+ days, change the channel — try phone or LinkedIn instead of another email");
    recommendations.push("Conduct a 'why we lost' analysis within 48 hours of deal loss to capture fresh insights");
    if (recommendations.length < 4) recommendations.push("Build a competitive battle card with specific rebuttals for the winning vendor's claims");
  }

  // ── STALLED deals ─────────────────────────────────────────────────────────
  else {
    if (prospectWentSilent) riskFactors.push("Prospect disengaged after initial interest — multiple follow-ups went unanswered");
    if (!hasMultiThread) riskFactors.push("Never expanded beyond a single contact, limiting deal durability");
    if (hasChampionChange) riskFactors.push("Internal restructuring disrupted the evaluation process");
    riskFactors.push("No clear buying timeline or urgency was established");

    if (riskFactors.length < 2) riskFactors.push("Deal lacked a compelling event to drive urgency");

    if (fastInitialResponse) winFactors.push("Initial engagement was promising — prospect responded quickly");
    if (hasProposal) winFactors.push("Provided thorough proposal and supporting materials");
    winFactors.push("Maintained professional follow-up cadence without being aggressive");
    if (winFactors.length < 2) winFactors.push("Showed persistence in trying to re-engage the prospect");

    recommendations.push("Establish a compelling event or deadline early in the sales process to create urgency");
    recommendations.push("If no response after 3 follow-ups, switch to a different approach (phone, referral, different stakeholder)");
    recommendations.push("Qualify harder in early conversations — confirm budget, authority, need, and timeline before investing in proposals");
    if (hasChampionChange) recommendations.push("When a champion leaves, treat it as a new deal — re-qualify from scratch with the replacement");
    if (recommendations.length < 4) recommendations.push("Consider a 'break up' email after extended silence to prompt a definitive response");
  }

  // ── Compute score ─────────────────────────────────────────────────────────
  let score: number;
  let prediction: ThreadHealth["prediction"];

  if (outcome === "won") {
    const frictionPenalty = (hasPriceObjection ? 5 : 0) + (hasCompetitor ? 5 : 0) + (!hasMultiThread ? 3 : 0);
    score = Math.max(70, 95 - frictionPenalty);
    prediction = "on_track";
  } else if (outcome === "lost") {
    const executionBonus = (hasProposal ? 5 : 0) + (fastInitialResponse ? 5 : 0) + (hasMultiThread ? 5 : 0);
    const externalFactor = hasCompetitor || hasContractBlocker || hasChampionChange;
    score = externalFactor ? Math.min(50, 30 + executionBonus) : Math.min(30, 15 + executionBonus);
    prediction = externalFactor ? "at_risk" : "critical";
  } else {
    // Stalled — score based on engagement level before stall
    const engagementBonus = (hasMultiThread ? 10 : 0) +
      (hasExecutive ? 10 : 0) +
      (hasProposal ? 8 : 0) +
      (fastInitialResponse ? 5 : 0) +
      (hasCompliance ? 5 : 0) +
      (hasUrgency ? 5 : 0);
    score = Math.min(55, 20 + engagementBonus);
    prediction = score >= 40 ? "at_risk" : "critical";
  }

  return {
    healthScore: score,
    prediction,
    outcome,
    winFactors: winFactors.slice(0, 4),
    riskFactors: riskFactors.slice(0, 4),
    recommendations: recommendations.slice(0, 5),
  };
}

// ── Main ────────────────────────────────────────────────────────────────────
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

function main() {
  const threadsPath = resolve(__scriptDir, "..", "src", "lib", "data", "threads.json");
  const rawMessages: EmailMessage[] = JSON.parse(readFileSync(threadsPath, "utf-8"));
  const threads = groupIntoThreads(rawMessages);

  console.log(`Processing ${threads.length} threads deterministically...\n`);

  const caseStudies: CaseStudy[] = [];

  for (const thread of threads) {
    const outcome = classifyOutcome(thread);
    const product = extractProduct(thread.messages);
    const mainContact = extractMainContact(thread);

    const taggedMessages = thread.messages.map((msg) => ({
      ...msg,
      tags: tagMessage(msg),
    }));

    const threadTags = buildThreadTags(thread, outcome);
    const health = generateHealth(thread, outcome);

    console.log(`  ✓ "${thread.subject}" → ${outcome} (${health.healthScore}/100) [${product ?? "generic"}]`);

    caseStudies.push({
      conversationId: thread.conversationId,
      subject: thread.subject,
      product,
      mainContact,
      threadTags,
      messages: taggedMessages,
      health,
    });
  }

  const outPath = resolve(__scriptDir, "..", "src", "lib", "data", "case-studies.json");
  writeFileSync(outPath, JSON.stringify(caseStudies, null, 2));
  console.log(`\n✓ Saved ${caseStudies.length} case studies to src/lib/data/case-studies.json`);

  // Print summary
  const won = caseStudies.filter((c) => c.health.outcome === "won").length;
  const lost = caseStudies.filter((c) => c.health.outcome === "lost").length;
  const stalled = caseStudies.filter((c) => c.health.outcome === "stalled").length;
  console.log(`  Won: ${won} | Lost: ${lost} | Stalled: ${stalled}`);
}

main();
