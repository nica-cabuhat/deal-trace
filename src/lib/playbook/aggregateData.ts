import type { EmailThread } from "@/lib/types/thread";
import type { ThreadHealth } from "@/lib/queries/useScore";

const SELLER_DOMAIN = "sophos.com";

export interface FrequencyItem {
  label: string;
  count: number;
  pct: number;
}

export interface PlaybookData {
  totalThreads: number;
  totalMessages: number;
  dateRange: { from: string; to: string };

  wonCount: number;
  lostCount: number;
  stalledCount: number;
  avgScoreWon: number;
  avgScoreLost: number;
  avgScoreStalled: number;
  overallAvgScore: number;
  avgThreadLength: number;
  avgResponseHours: number;

  winSignals: FrequencyItem[];
  lossReasons: FrequencyItem[];

  comparison: { dimension: string; won: string; lost: string }[];

  stakeholders: {
    name: string;
    email: string;
    dealCount: number;
    outcomes: string[];
  }[];

  products: {
    product: string;
    wonCount: number;
    lostCount: number;
    total: number;
  }[];

  scoreDistribution: { range: string; count: number }[];
  riskCallouts: string[];

  earlyActions: string[];
  midActions: string[];
  lateActions: string[];

  objections: { objection: string; frequency: string; response: string }[];
}

function isSeller(email: string): boolean {
  return email.toLowerCase().includes(SELLER_DOMAIN);
}

function rankFrequency(items: string[], total: number): FrequencyItem[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({
      label,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function computeAvgResponseHours(threads: EmailThread[]): number {
  const hours: number[] = [];
  for (const thread of threads) {
    const msgs = thread.messages;
    for (let i = 1; i < msgs.length; i++) {
      const prev = msgs[i - 1];
      const curr = msgs[i];
      if (isSeller(prev.from.emailAddress.address) && !isSeller(curr.from.emailAddress.address)) {
        const diff =
          new Date(curr.receivedDateTime).getTime() -
          new Date(prev.receivedDateTime).getTime();
        if (diff > 0) hours.push(diff / (1000 * 60 * 60));
      }
    }
  }
  return hours.length > 0 ? Math.round(mean(hours)) : 0;
}

const EARLY_RE =
  /\b(qualif|discover|initial|first|early|prospect|outreach|research|target|identify|intro)/i;
const MID_RE =
  /\b(proposal|demo|pricing|technical|evaluat|stakeholder|poc|proof.of.concept|pilot|budget|roi)/i;
const LATE_RE =
  /\b(contract|procure|clos|onboard|negoti|legal|sign|approv|order|implement|deploy)/i;

function bucketAction(text: string): "early" | "mid" | "late" {
  if (LATE_RE.test(text)) return "late";
  if (MID_RE.test(text)) return "mid";
  return "early";
}

function getObjectionResponse(signal: string): string {
  const lower = signal.toLowerCase();
  if (lower.includes("pricing") || lower.includes("budget") || lower.includes("cost"))
    return "Reframe around TCO and risk reduction. Quantify breach cost vs. investment.";
  if (lower.includes("competitor") || lower.includes("alternative"))
    return "Highlight differentiation in managed response and integrated XDR capabilities.";
  if (lower.includes("defer") || lower.includes("delay") || lower.includes("stall"))
    return "Create urgency with threat landscape data and time-bound compliance deadlines.";
  if (lower.includes("legal") || lower.includes("contract") || lower.includes("blocker"))
    return "Engage legal early, provide pre-approved contract templates and compliance certs.";
  if (lower.includes("champion") || lower.includes("change"))
    return "Multi-thread relationships to avoid single point of failure in the buying committee.";
  if (lower.includes("declined") || lower.includes("not interested"))
    return "Reassess pain points, offer a no-obligation security assessment to re-engage.";
  return "Address directly with relevant case studies and ROI data from similar deployments.";
}

export function aggregatePlaybookData(
  threads: EmailThread[],
  healthMap: Record<string, ThreadHealth>,
): PlaybookData {
  const entries = threads
    .map((t) => ({ thread: t, health: healthMap[t.conversationId] }))
    .filter((e): e is { thread: EmailThread; health: ThreadHealth } => !!e.health);

  const won = entries.filter((e) => e.health.outcome === "won");
  const lost = entries.filter((e) => e.health.outcome === "lost");
  const stalled = entries.filter(
    (e) => e.health.outcome !== "won" && e.health.outcome !== "lost",
  );

  // Date range
  const allDates = threads.flatMap((t) =>
    t.messages.map((m) => new Date(m.receivedDateTime).getTime()),
  );
  const minDate = allDates.length > 0 ? new Date(Math.min(...allDates)) : new Date();
  const maxDate = allDates.length > 0 ? new Date(Math.max(...allDates)) : new Date();
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "numeric" });

  // Win signals
  const winSignals = rankFrequency(
    won.flatMap((e) => e.health.winFactors),
    won.length,
  ).slice(0, 8);

  // Loss reasons
  const lossReasons = rankFrequency(
    lost.flatMap((e) => e.health.riskFactors),
    lost.length,
  ).slice(0, 8);

  // Head-to-head comparison
  const wonMsgs = mean(won.map((e) => e.thread.messages.length));
  const lostMsgs = mean(lost.map((e) => e.thread.messages.length));
  const wonProducts = new Set(won.map((e) => e.thread.product).filter(Boolean));
  const lostProducts = new Set(lost.map((e) => e.thread.product).filter(Boolean));

  const multiRate = (group: typeof entries) => {
    const multi = group.filter((e) => {
      const contacts = new Set(
        e.thread.messages
          .filter((m) => !isSeller(m.from.emailAddress.address))
          .map((m) => m.from.emailAddress.address),
      );
      return contacts.size > 1;
    });
    return group.length > 0 ? Math.round((multi.length / group.length) * 100) : 0;
  };

  const comparison = [
    {
      dimension: "Avg Health Score",
      won: `${mean(won.map((e) => e.health.healthScore))}%`,
      lost: `${mean(lost.map((e) => e.health.healthScore))}%`,
    },
    {
      dimension: "Avg Messages / Thread",
      won: `${wonMsgs}`,
      lost: `${lostMsgs}`,
    },
    {
      dimension: "Products Involved",
      won: `${wonProducts.size}`,
      lost: `${lostProducts.size}`,
    },
    {
      dimension: "Multi-Stakeholder Rate",
      won: `${multiRate(won)}%`,
      lost: `${multiRate(lost)}%`,
    },
    {
      dimension: "Avg Response Time",
      won: `${computeAvgResponseHours(won.map((e) => e.thread))}h`,
      lost: `${computeAvgResponseHours(lost.map((e) => e.thread))}h`,
    },
  ];

  // Stakeholders (prospect contacts)
  const contactMap = new Map<
    string,
    { name: string; email: string; outcomes: Set<string>; deals: Set<string> }
  >();
  for (const entry of entries) {
    const outcome = entry.health.outcome ?? "stalled";
    for (const m of entry.thread.messages) {
      const addr = m.from.emailAddress.address.toLowerCase();
      if (isSeller(addr)) continue;
      if (!contactMap.has(addr)) {
        contactMap.set(addr, {
          name: m.from.emailAddress.name,
          email: addr,
          outcomes: new Set(),
          deals: new Set(),
        });
      }
      const c = contactMap.get(addr)!;
      c.outcomes.add(outcome);
      c.deals.add(entry.thread.conversationId);
    }
  }
  const stakeholders = [...contactMap.values()]
    .map((c) => ({
      name: c.name,
      email: c.email,
      dealCount: c.deals.size,
      outcomes: [...c.outcomes],
    }))
    .sort((a, b) => b.dealCount - a.dealCount)
    .slice(0, 12);

  // Products
  const productMap = new Map<string, { won: number; lost: number; total: number }>();
  for (const entry of entries) {
    const p = entry.thread.product ?? "Unknown";
    if (!productMap.has(p)) productMap.set(p, { won: 0, lost: 0, total: 0 });
    const pm = productMap.get(p)!;
    pm.total++;
    if (entry.health.outcome === "won") pm.won++;
    else if (entry.health.outcome === "lost") pm.lost++;
  }
  const products = [...productMap.entries()]
    .map(([product, c]) => ({ product, wonCount: c.won, lostCount: c.lost, total: c.total }))
    .sort((a, b) => b.total - a.total);

  // Score distribution
  const ranges = ["0–20", "21–40", "41–60", "61–80", "81–100"];
  const buckets = [0, 0, 0, 0, 0];
  for (const e of entries) {
    const s = e.health.healthScore;
    if (s <= 20) buckets[0]++;
    else if (s <= 40) buckets[1]++;
    else if (s <= 60) buckets[2]++;
    else if (s <= 80) buckets[3]++;
    else buckets[4]++;
  }
  const scoreDistribution = ranges.map((range, i) => ({ range, count: buckets[i] }));

  // Risk callouts from at-risk / critical deals
  const riskCallouts = entries
    .filter((e) => e.health.prediction === "at_risk" || e.health.prediction === "critical")
    .flatMap((e) => e.health.riskFactors.slice(0, 1))
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 6);

  // Actions by stage (deduplicated)
  const allRecs = entries.flatMap((e) => e.health.recommendations);
  const earlyActions: string[] = [];
  const midActions: string[] = [];
  const lateActions: string[] = [];
  const seen = new Set<string>();
  for (const rec of allRecs) {
    if (seen.has(rec)) continue;
    seen.add(rec);
    const stage = bucketAction(rec);
    if (stage === "early" && earlyActions.length < 4) earlyActions.push(rec);
    else if (stage === "mid" && midActions.length < 4) midActions.push(rec);
    else if (stage === "late" && lateActions.length < 4) lateActions.push(rec);
  }

  // Objections from negative message tags
  const negTagMap = new Map<string, number>();
  for (const entry of entries) {
    for (const m of entry.thread.messages) {
      for (const tag of m.tags ?? []) {
        if (tag.direction !== "negative") continue;
        negTagMap.set(tag.signal, (negTagMap.get(tag.signal) ?? 0) + 1);
      }
    }
  }
  const objections = [...negTagMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([signal, count]) => ({
      objection: signal,
      frequency: `${count}x`,
      response: getObjectionResponse(signal),
    }));

  return {
    totalThreads: threads.length,
    totalMessages: threads.reduce((sum, t) => sum + t.messages.length, 0),
    dateRange: { from: fmt(minDate), to: fmt(maxDate) },
    wonCount: won.length,
    lostCount: lost.length,
    stalledCount: stalled.length,
    avgScoreWon: mean(won.map((e) => e.health.healthScore)),
    avgScoreLost: mean(lost.map((e) => e.health.healthScore)),
    avgScoreStalled: mean(stalled.map((e) => e.health.healthScore)),
    overallAvgScore: mean(entries.map((e) => e.health.healthScore)),
    avgThreadLength: mean(threads.map((t) => t.messages.length)),
    avgResponseHours: computeAvgResponseHours(threads),
    winSignals,
    lossReasons,
    comparison,
    stakeholders,
    products,
    scoreDistribution,
    riskCallouts,
    earlyActions,
    midActions,
    lateActions,
    objections,
  };
}
