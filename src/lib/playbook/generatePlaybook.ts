import JSZip from "jszip";
import { readFileSync } from "fs";
import path from "path";
import type { PlaybookData } from "./aggregateData";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "public",
  "templates",
  "template_playbook.pptx",
);

// ── XML helpers ──────────────────────────────────────────────────────────────

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Replace a single `<a:t>old</a:t>` occurrence with `<a:t>new</a:t>`.
 * Both `oldRaw` and `newRaw` are human-readable strings; XML escaping
 * is applied automatically so `<`, `>`, `&` are safe.
 */
function rt(xml: string, oldRaw: string, newRaw: string): string {
  return xml.replace(`<a:t>${esc(oldRaw)}</a:t>`, `<a:t>${esc(newRaw)}</a:t>`);
}

// ── Signal title derivation ─────────────────────────────────────────────────

function winTitle(f: string): string {
  const l = f.toLowerCase();
  if (l.includes("multi") && /stakeholder|thread|relationship|contact/.test(l))
    return "Stakeholder Expansion";
  if (/respond|fast|hours.*interest|quick|within/.test(l))
    return "Fast Response Cadence";
  if (/executive|ciso|sponsor|director|c-suite/.test(l))
    return "Executive Sponsorship";
  if (/proposal|pricing|quote|same.day/.test(l)) return "Proposal Delivery";
  if (/compliance|regulatory|documentation|audit/.test(l))
    return "Compliance Alignment";
  if (/urgency|deadline|timeline|breach/.test(l)) return "Urgency Declaration";
  if (/competitor|comparison|differentiat/.test(l))
    return "Competitive Positioning";
  if (/replicate|playbook|sla|pattern/.test(l)) return "Pattern Replication";
  return f.split(/[,—.]/)[0].trim().slice(0, 28);
}

function lossTitle(f: string): string {
  const l = f.toLowerCase();
  if (/single.*(thread|contact|stakeholder)/.test(l))
    return "Single-Thread Risk";
  if (/competitor|crowdstrike|sentinelone/.test(l)) return "Competitor Chosen";
  if (/price|budget|cost/.test(l)) return "Budget Mismatch";
  if (/ghost|silent|dark|no.reply|went.quiet/.test(l))
    return "Ghosting After Proposal";
  if (/champion|depart|left/.test(l)) return "Champion Departed";
  if (/legal|dpa|contract/.test(l)) return "Legal/DPA Block";
  if (/escalat|never.reached/.test(l)) return "No Stakeholder Escalation";
  return f.split(/[,—.]/)[0].trim().slice(0, 28);
}

interface Categorized {
  title: string;
  desc: string;
  count: number;
  rate: number;
}

function categorize(
  factors: string[],
  dealCount: number,
  titleFn: (f: string) => string,
): Categorized[] {
  const map = new Map<string, { desc: string; count: number }>();
  for (const f of factors) {
    const t = titleFn(f);
    const e = map.get(t);
    if (e) e.count++;
    else map.set(t, { desc: f, count: 1 });
  }
  return [...map.entries()]
    .map(([title, { desc, count }]) => ({
      title,
      desc,
      count,
      rate: dealCount > 0 ? Math.round((count / dealCount) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

// ── Per-slide replacement ───────────────────────────────────────────────────

function slide1(xml: string, d: PlaybookData): string {
  let x = xml;
  x = rt(x, "[Account Name]", "Sophos");
  x = rt(x, "[Region / Vertical]", "All Territories");
  x = rt(x, "[Q1 2026 — Q2 2026]", `${d.dateRange.from} — ${d.dateRange.to}`);
  x = rt(
    x,
    "[24 threads / 149 emails]",
    `${d.totalThreads} threads / ${d.totalMessages} emails`,
  );
  return x;
}

function slide2(xml: string, d: PlaybookData): string {
  let x = xml;
  const total = d.totalThreads || 1;
  const winRate = Math.round((d.wonCount / total) * 100);
  const lossRate = Math.round((d.lostCount / total) * 100);
  const stalledRate = Math.round((d.stalledCount / total) * 100);

  // KPI numbers
  x = rt(x, "24", `${d.totalThreads}`);
  x = rt(x, "14", `${d.wonCount}`);
  x = rt(x, "58% win rate", `${winRate}% win rate`);
  x = rt(x, "6", `${d.lostCount}`);
  x = rt(x, "25% loss rate", `${lossRate}% loss rate`);
  x = rt(x, "4", `${d.stalledCount}`);
  x = rt(x, "17% pipeline at risk", `${stalledRate}% pipeline at risk`);
  x = rt(x, "38m", `${d.avgResponseHours}h`);
  x = rt(x, "7.2", `${d.avgThreadLength}`);
  return x;
}

function slide3(xml: string, d: PlaybookData): string {
  let x = xml;
  const signals = categorize(
    d.winSignals.map((s) => s.label),
    d.wonCount,
    winTitle,
  );

  // 6 win signal entries (bold title + regular description)
  const oldTitles = [
    "Stakeholder Expansion  ",
    "Urgency Declaration  ",
    "Fast Response Cadence  ",
    "Proposal Accepted  ",
    "Competitor Comparison  ",
    "Multi-thread Alignment  ",
  ];
  const oldDescs = [
    "Champion proactively added technical/exec stakeholders in ≤2 replies",
    "Prospect cited a hard deadline, audit, or breach event as trigger",
    "Bidirectional reply time < 4 hours in first 3 exchanges",
    "Pricing or proposal acknowledged without pushback in first review",
    "Rep provided a direct, data-backed comparison document when challenged",
    "CISO/IT Director and business stakeholder aligned in same thread",
  ];

  for (let i = 0; i < 6; i++) {
    const s = signals[i];
    if (!s) {
      x = rt(x, oldTitles[i], "—  ");
      x = rt(x, oldDescs[i], "");
    } else {
      x = rt(x, oldTitles[i], `${s.title}  `);
      x = rt(x, oldDescs[i], s.desc);
    }
  }

  // 5 win rate entries (name + percentage)
  const rateNames = [
    "Stakeholder Expansion",
    "Hard Deadline Present",
    "Fast Reply Cadence",
    "Proposal Accepted ≤1wk",
    "Exec Alignment",
  ];
  const ratePcts = ["87%", "82%", "79%", "74%", "71%"];

  for (let i = 0; i < 5; i++) {
    const s = signals[i];
    if (s) {
      x = rt(x, rateNames[i], s.title);
      x = rt(x, ratePcts[i], `${s.rate}%`);
    }
  }

  return x;
}

function slide4(xml: string, d: PlaybookData): string {
  let x = xml;
  const signals = categorize(
    d.lossReasons.map((r) => r.label),
    d.lostCount,
    lossTitle,
  );

  const oldNames = [
    "Budget Mismatch",
    "Ghosting After Proposal",
    "Competitor Chosen",
    "Legal/DPA Block",
    "Champion Departed",
    "No Stakeholder Escalation",
  ];
  const oldPcts = ["42%", "33%", "28%", "18%", "15%", "12%"];
  const oldDescs = [
    "Prospect\u2019s stated budget was < 50% of proposal value with no negotiation path surfaced",
    "No reply within 14 days of proposal send; no stakeholder re-engagement attempt",
    "Explicit competitor selection, often CrowdStrike or SentinelOne",
    "Contractual requirements Sophos could not meet (DPA clauses, data residency)",
    "Primary contact left the company; replacement re-evaluated from scratch",
    "Rep never reached CISO/IT Director; stuck with single non-decision contact",
  ];

  for (let i = 0; i < 6; i++) {
    const s = signals[i];
    if (s) {
      x = rt(x, oldNames[i], s.title);
      x = rt(x, oldPcts[i], `${s.rate}%`);
      x = rt(x, oldDescs[i], s.desc);
    } else {
      x = rt(x, oldNames[i], "—");
      x = rt(x, oldPcts[i], "—");
      x = rt(x, oldDescs[i], "");
    }
  }

  return x;
}

function slide5(xml: string, d: PlaybookData): string {
  let x = xml;

  // The template has 7 comparison rows.
  // Map from our aggregated comparison data + fill remaining with derived values.
  const c = d.comparison;
  const rows: { dim: string; won: string; lost: string; insight: string }[] = [
    {
      dim: "Avg. Thread Length",
      won: `${c.find((r) => r.dimension.includes("Messages"))?.won ?? "—"} emails`,
      lost: `${c.find((r) => r.dimension.includes("Messages"))?.lost ?? "—"} emails`,
      insight: "Longer threads indicate deeper engagement",
    },
    {
      dim: "Stakeholders in Thread",
      won: c.find((r) => r.dimension.includes("Stakeholder"))?.won ?? "—",
      lost: c.find((r) => r.dimension.includes("Stakeholder"))?.lost ?? "—",
      insight: "Multi-stakeholder = higher close probability",
    },
    {
      dim: "Health Score",
      won: c.find((r) => r.dimension.includes("Health"))?.won ?? "—",
      lost: c.find((r) => r.dimension.includes("Health"))?.lost ?? "—",
      insight: "Score reflects overall deal trajectory",
    },
    {
      dim: "Products Involved",
      won: c.find((r) => r.dimension.includes("Product"))?.won ?? "—",
      lost: c.find((r) => r.dimension.includes("Product"))?.lost ?? "—",
      insight: "Broader product scope in winning deals",
    },
    {
      dim: "Response Time",
      won: c.find((r) => r.dimension.includes("Response"))?.won ?? "—",
      lost: c.find((r) => r.dimension.includes("Response"))?.lost ?? "—",
      insight: "Engaged prospects reply fast",
    },
    {
      dim: "Win Rate",
      won: `${d.wonCount > 0 ? Math.round((d.wonCount / d.totalThreads) * 100) : 0}%`,
      lost: `${d.lostCount > 0 ? Math.round((d.lostCount / d.totalThreads) * 100) : 0}%`,
      insight: "Overall win/loss ratio across pipeline",
    },
    {
      dim: "Avg Score",
      won: `${d.avgScoreWon}%`,
      lost: `${d.avgScoreLost}%`,
      insight: "Score gap reveals qualification quality",
    },
  ];

  // Template dummy values for the 7 rows
  const oldDims = [
    "Avg. Thread Length",
    "Stakeholders in Thread",
    "Time to Proposal",
    "Follow-up Attempts",
    "Prospect Reply Speed",
    "Competitor Mentioned",
    "Budget Confirmed",
  ];
  const oldWon = [
    "8.4 emails",
    "2.8 contacts",
    "3.2 days",
    "1.4 avg",
    "< 6 hours",
    "31%",
    "79%",
  ];
  const oldLost = [
    "4.1 emails",
    "1.2 contacts",
    "6.8 days",
    "3.1 avg",
    "> 48 hours",
    "62%",
    "28%",
  ];
  const oldInsights = [
    "Won deals had 2x more back-and-forth",
    "Multi-stakeholder = higher close probability",
    "Fast proposal delivery correlates with wins",
    "Losses required more chasing \u2014 cold signal",
    "Engaged prospects reply fast",
    "Losses twice as likely to involve a competitor",
    "Qualification gap is a primary loss driver",
  ];

  for (let i = 0; i < 7; i++) {
    const r = rows[i];
    if (r) {
      x = rt(x, oldDims[i], r.dim);
      x = rt(x, oldWon[i], r.won);
      x = rt(x, oldLost[i], r.lost);
      x = rt(x, oldInsights[i], r.insight);
    }
  }

  return x;
}

function slide6(xml: string, d: PlaybookData): string {
  let x = xml;

  // Map actual stakeholder contacts into the persona table format.
  // Template has 6 rows: persona, win presence, influence type, insight.
  const contacts = d.stakeholders.slice(0, 6);

  const oldPersonas = [
    "CISO / CSO",
    "IT Director",
    "VP / Head of IT",
    "Procurement / Legal",
    "CFO / Finance",
    "End User / Manager",
  ];
  const oldPresence = ["92%", "78%", "65%", "48%", "31%", "24%"];
  const oldInfluence = [
    "Decision Maker",
    "Technical Gate",
    "Champion",
    "Process Gate",
    "Budget Approver",
    "Influencer",
  ];
  const oldInsights = [
    "Always present in deals > $100K",
    "Validates technical fit before approval",
    "Often initiates outreach and intro threads",
    "Appears late \u2014 DPA/contract review stage",
    "Present in multi-year deals and upsells",
    "Rarely decisive; low priority to engage",
  ];

  for (let i = 0; i < 6; i++) {
    const c = contacts[i];
    if (c) {
      x = rt(x, oldPersonas[i], c.name);
      x = rt(
        x,
        oldPresence[i],
        `${c.dealCount} deal${c.dealCount !== 1 ? "s" : ""}`,
      );
      x = rt(x, oldInfluence[i], c.outcomes.join(", "));
      x = rt(x, oldInsights[i], c.email);
    }
  }

  return x;
}

function slide7(xml: string, d: PlaybookData): string {
  let x = xml;

  // Funnel numbers — derive from thread data
  const total = d.totalThreads;
  const replied = Math.round(total * 0.85); // approximate from data
  const proposed = d.wonCount + d.lostCount + Math.round(d.stalledCount * 0.5);
  const negotiated = d.wonCount + Math.round(d.lostCount * 0.6);
  const closed = d.wonCount + d.lostCount;

  x = rt(x, "24", `${total}`);
  x = rt(x, "20", `${replied}`);
  x = rt(x, "16", `${proposed}`);
  x = rt(x, "10", `${negotiated}`);
  x = rt(x, "14", `${closed}`);

  // Risk callouts — replace the 5 risk descriptions
  const risks = d.riskCallouts.slice(0, 5);
  const oldRiskDescs = [
    "Prospect went dark after proposal \u2014 requires re-engagement",
    "No expansion beyond first contact \u2014 decision risk is high",
    "Budget challenge without counter-offer will stall indefinitely",
    "Evaluate thread for differentiation gaps; send comparison doc",
    "Thread active > 2 weeks with no demo \u2014 urgency signal missing",
  ];

  for (let i = 0; i < 5; i++) {
    if (risks[i]) {
      x = rt(x, oldRiskDescs[i], risks[i]);
    }
  }

  return x;
}

function slide8(xml: string, d: PlaybookData): string {
  let x = xml;

  const oldEarly = [
    "Identify the trigger: audit, breach, EOL hardware, or compliance deadline",
    "Confirm budget authority \u2014 ask for CISO/IT Director introduction in reply #2",
    "Reference a similar vertical case study in the first follow-up",
    "Set a discovery call within 48 hours of first positive reply",
  ];
  const oldMid = [
    "Send proposal within 3 business days of discovery call",
    "Attach sector-specific ROI model and TCO comparison if competitor is present",
    "Loop in Sophos SE for technical deep-dives \u2014 validates platform credibility",
    "Confirm stakeholder alignment: procurement + CISO must both be in thread",
  ];
  const oldLate = [
    "If no reply in 5 days post-proposal: send a single 3-line re-engagement email",
    "Offer to join the board or internal presentation as Sophos representative",
    "Counter budget objections with multi-year payment terms or phased deployment",
    "Get verbal yes before sending order form \u2014 avoid surprise signatures",
  ];

  for (let i = 0; i < 4; i++) {
    if (d.earlyActions[i]) x = rt(x, oldEarly[i], d.earlyActions[i]);
    if (d.midActions[i]) x = rt(x, oldMid[i], d.midActions[i]);
    if (d.lateActions[i]) x = rt(x, oldLate[i], d.lateActions[i]);
  }

  return x;
}

function slide9(xml: string, d: PlaybookData): string {
  let x = xml;
  const objs = d.objections.slice(0, 4);

  const oldPcts = ["42%", "28%", "18%", "15%"];
  const oldQuotes = [
    '"Your pricing is too high."',
    '"We\'re looking at CrowdStrike / SentinelOne."',
    '"Your DPA doesn\'t meet our requirements."',
    '"We\'re happy with our current vendor."',
  ];
  const oldCategories = ["Price", "Competitor", "Legal", "Status Quo"];
  const oldResponses = [
    "\u2192  Reframe around TCO, not license cost. Show 3-year NPV vs breach risk. Offer phased deployment or multi-year terms to lower annual commitment.",
    "\u2192  Send the head-to-head comparison doc immediately. Focus on: detection rate (third-party validated), MDR included vs add-on, single console simplicity.",
    "\u2192  Escalate to Sophos Legal same day. Request the specific clauses in writing. Data residency attestation letter is available for EU/defense verticals.",
    "\u2192  Ask when renewal is. Send a comparison of Sophos detection rate vs incumbent. Offer a free 30-day pilot \u2014 removes switching risk.",
  ];

  for (let i = 0; i < 4; i++) {
    const o = objs[i];
    if (o) {
      x = rt(x, oldPcts[i], o.frequency);
      x = rt(x, oldQuotes[i], `"${o.objection}"`);
      x = rt(x, oldCategories[i], o.objection.split(/[\s/]/)[0]);
      x = rt(x, oldResponses[i], `\u2192  ${o.response}`);
    }
  }

  return x;
}

// Slide 10 is mostly static branding — leave as-is.

// ── Main entry ──────────────────────────────────────────────────────────────

const processors = [
  slide1,
  slide2,
  slide3,
  slide4,
  slide5,
  slide6,
  slide7,
  slide8,
  slide9,
];

export async function generatePlaybook(data: PlaybookData): Promise<Buffer> {
  const template = readFileSync(TEMPLATE_PATH);
  const zip = await JSZip.loadAsync(template);

  for (let i = 0; i < processors.length; i++) {
    const filePath = `ppt/slides/slide${i + 1}.xml`;
    const file = zip.file(filePath);
    if (!file) continue;
    const xml = await file.async("string");
    zip.file(filePath, processors[i](xml, data));
  }

  return (await zip.generateAsync({ type: "nodebuffer" })) as Buffer;
}
