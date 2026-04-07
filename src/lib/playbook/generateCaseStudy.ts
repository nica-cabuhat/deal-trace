import JSZip from "jszip";
import { readFileSync } from "fs";
import path from "path";
import type { EmailThread } from "@/lib/types/thread";
import type { ThreadHealth } from "@/lib/queries/useScore";

const TEMPLATES_DIR = path.join(process.cwd(), "public", "templates");
const SELLER_DOMAIN = "sophos.com";

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function rt(xml: string, oldRaw: string, newRaw: string): string {
  return xml.replaceAll(`<a:t>${esc(oldRaw)}</a:t>`, `<a:t>${esc(newRaw)}</a:t>`);
}

function isSeller(addr: string): boolean {
  return addr.toLowerCase().includes(SELLER_DOMAIN);
}

// ── Data derivation from a single thread ─────────────────────────────────────

function deriveCompany(thread: EmailThread): string {
  const prospect = thread.messages.find(
    (m) => !isSeller(m.from.emailAddress.address),
  );
  if (prospect) {
    const domain = prospect.from.emailAddress.address.split("@")[1];
    if (domain) {
      const name = domain.split(".")[0];
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
    return prospect.from.emailAddress.name;
  }
  return thread.mainContact ?? "Client";
}

function deriveDays(thread: EmailThread): number {
  const dates = thread.messages.map(
    (m) => new Date(m.receivedDateTime).getTime(),
  );
  const diff = Math.max(...dates) - Math.min(...dates);
  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function deriveCloseDate(thread: EmailThread): string {
  const last = thread.messages[thread.messages.length - 1];
  return new Date(last.receivedDateTime).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getProspects(
  thread: EmailThread,
): { name: string; email: string }[] {
  const seen = new Set<string>();
  const result: { name: string; email: string }[] = [];
  for (const m of thread.messages) {
    const addr = m.from.emailAddress.address.toLowerCase();
    if (isSeller(addr) || seen.has(addr)) continue;
    seen.add(addr);
    result.push({ name: m.from.emailAddress.name, email: addr });
  }
  return result;
}

function getSellerName(thread: EmailThread): string {
  const seller = thread.messages.find((m) =>
    isSeller(m.from.emailAddress.address),
  );
  return seller?.from.emailAddress.name ?? "Rep";
}

function dayLabel(thread: EmailThread, msgIndex: number): string {
  const first = new Date(thread.messages[0].receivedDateTime).getTime();
  const current = new Date(
    thread.messages[msgIndex].receivedDateTime,
  ).getTime();
  const day = Math.floor((current - first) / (1000 * 60 * 60 * 24));
  return `Day ${day}`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "\u2026";
}

function deriveSignals(
  thread: EmailThread,
  positive: boolean,
): { title: string; desc: string }[] {
  const seen = new Set<string>();
  const result: { title: string; desc: string }[] = [];
  for (const m of thread.messages) {
    for (const tag of m.tags ?? []) {
      if (positive && tag.direction !== "positive") continue;
      if (!positive && tag.direction !== "negative") continue;
      if (seen.has(tag.signal)) continue;
      seen.add(tag.signal);
      result.push({
        title: tag.signal
          .split(/[/\-_]/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "),
        desc: truncate(m.bodyPreview, 80),
      });
    }
  }
  // Also add from threadTags
  for (const tt of thread.threadTags ?? []) {
    if (positive && tt.direction !== "positive") continue;
    if (!positive && tt.direction !== "negative") continue;
    if (seen.has(tt.pattern)) continue;
    seen.add(tt.pattern);
    result.push({
      title: tt.pattern
        .split(/[\s/\-_]+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
      desc: `Pattern confidence: ${Math.round(tt.score * 100)}%`,
    });
  }
  return result.slice(0, 6);
}

function deriveLossReason(health: ThreadHealth): string {
  if (!health.riskFactors.length) return "Deal did not progress";
  const f = health.riskFactors[0].toLowerCase();
  if (f.includes("competitor")) return "Competitor Chosen";
  if (f.includes("budget") || f.includes("price")) return "Budget Mismatch";
  if (f.includes("ghost") || f.includes("silent")) return "Prospect Went Silent";
  if (f.includes("champion")) return "Champion Departed";
  if (f.includes("legal") || f.includes("contract")) return "Legal/DPA Block";
  if (f.includes("single")) return "Single-Thread Risk";
  return "Deal Stalled";
}

// ── WON template replacements ────────────────────────────────────────────────

function wonSlide1(
  xml: string,
  company: string,
  product: string,
  days: number,
  msgs: number,
  date: string,
  score: number,
  seller: string,
): string {
  let x = xml;
  x = rt(x, "Mirkwood Retail Group", company);
  x = rt(x, "Retail  \u00b7  APAC", "Cybersecurity");
  x = rt(x, "$142,000", `${score}%`);
  x = rt(x, "Sophos XDR + MDR Complete", product);
  x = rt(x, "4 days", `${days} days`);
  x = rt(x, "200", `${msgs}`);
  x = rt(x, "March 14, 2026", date);
  x = rt(x, "DEAL VALUE", "HEALTH SCORE");
  x = rt(x, "SEATS", "EMAILS");
  x = rt(x, "Nicaela Cabuhat  \u00b7  Sales Engineer", seller);
  return x;
}

function wonSlide2(
  xml: string,
  company: string,
  product: string,
  days: number,
  msgs: number,
  date: string,
  score: number,
  prospects: { name: string; email: string }[],
  trigger: string,
): string {
  let x = xml;
  x = rt(
    x,
    "Sophos Confidential  |  DealTrace Case Study: Mirkwood Retail Group  |  March 14, 2026",
    `Sophos Confidential  |  DealTrace Case Study: ${company}  |  ${date}`,
  );
  x = rt(x, "$142,000", `${score}%`);
  x = rt(x, "Deal Value", "Health Score");
  x = rt(x, "3-Year Contract", `${score >= 70 ? "On Track" : "At Risk"}`);
  x = rt(x, "4d", `${days}d`);
  x = rt(x, "From first email", "From first email");
  x = rt(x, "200", `${msgs}`);
  x = rt(x, "Seats", "Emails");
  x = rt(x, "XDR + MDR Complete", product);
  x = rt(x, "8", `${msgs}`);
  x = rt(x, "Retail", "Technology");
  x = rt(x, "APAC", "\u2014");
  x = rt(x, "200 employees \u00b7 12 locations", company);
  x = rt(x, "Sophos XDR + MDR Complete", product);
  x = rt(x, "Cloud-managed via Sophos Central", "\u2014");

  const p1 = prospects[0];
  const p2 = prospects[1];
  x = rt(
    x,
    "Legolas Greenleaf (VP IT)",
    p1 ? `${p1.name}` : "\u2014",
  );
  x = rt(
    x,
    "Gimli Gloinsson (IT Director)",
    p2 ? `${p2.name}` : "\u2014",
  );
  x = rt(
    x,
    "EOL Fortinet appliances in 6 months \u2014 CISO pressure to remediate before audit",
    truncate(trigger, 120),
  );
  return x;
}

function wonSlide3(
  xml: string,
  company: string,
  date: string,
  thread: EmailThread,
  health: ThreadHealth,
  prospects: { name: string }[],
  seller: string,
): string {
  let x = xml;
  x = rt(
    x,
    "Sophos Confidential  |  DealTrace Case Study: Mirkwood Retail Group  |  March 14, 2026",
    `Sophos Confidential  |  DealTrace Case Study: ${company}  |  ${date}`,
  );

  const msgs = thread.messages;
  const firstSeller = msgs.find((m) => isSeller(m.from.emailAddress.address));
  const firstProspect = msgs.find(
    (m) => !isSeller(m.from.emailAddress.address),
  );
  const midIdx = Math.min(Math.floor(msgs.length / 2), msgs.length - 1);
  const lastMsg = msgs[msgs.length - 1];
  const penultimate = msgs[Math.max(0, msgs.length - 2)];

  // Stage 1: Trigger
  x = rt(
    x,
    "EOL Fortinet appliances in 6 months \u2014 CISO pressure to remediate before audit",
    truncate(firstSeller?.bodyPreview ?? thread.subject, 120),
  );
  // Stage 2: First Signal
  x = rt(
    x,
    "Prospect replied same-day citing active internal concern about EOL hardware",
    truncate(firstProspect?.bodyPreview ?? "Prospect engaged with the thread", 120),
  );
  // Stage 3: Champion Move
  const champName = prospects[0]?.name ?? "Prospect";
  const p2Name = prospects[1]?.name;
  const champDesc = p2Name
    ? `${champName} engaged ${p2Name} in the conversation \u2014 stakeholder expansion`
    : `${champName} continued engagement through the deal cycle`;
  x = rt(
    x,
    "Legolas proactively added Gimli (IT Director) in reply #4 \u2014 unprompted stakeholder expansion",
    champDesc,
  );
  // Stage 4: Key Moment
  x = rt(
    x,
    "CISO approved proposal within 24 hours of submission \u2014 no negotiation required",
    truncate(penultimate.bodyPreview, 120),
  );
  // Stage 5: Closing Action
  x = rt(
    x,
    "Rep sent countersigned order form same day; onboarding team engaged within 24 hours",
    truncate(lastMsg.bodyPreview, 120),
  );

  // Customer quote
  const quoteMsg = msgs
    .filter((m) => !isSeller(m.from.emailAddress.address))
    .pop();
  const quoteText = quoteMsg
    ? truncate(quoteMsg.bodyPreview, 160)
    : "Great experience working with the Sophos team.";
  const quoterName = quoteMsg?.from.emailAddress.name ?? champName;
  x = rt(
    x,
    "\"Nicaela moved faster than any vendor I've worked with. From first email to signed contract in 4 days \u2014 exactly what we needed before our audit.\"  \u2014 Legolas Greenleaf, VP IT \u2014 Mirkwood Retail Group",
    `"${quoteText}"  \u2014 ${quoterName} \u2014 ${company}`,
  );

  return x;
}

function wonSlide4(
  xml: string,
  company: string,
  date: string,
  thread: EmailThread,
  days: number,
): string {
  let x = xml;
  x = rt(
    x,
    "Sophos Confidential  |  DealTrace Case Study: Mirkwood Retail Group  |  March 14, 2026",
    `Sophos Confidential  |  DealTrace Case Study: ${company}  |  ${date}`,
  );
  x = rt(
    x,
    "4 days from cold outreach to signed contract",
    `${days} days from first contact to deal close`,
  );

  // Template has 8 timeline entries — replace with actual messages (up to 8)
  const oldDays = ["Day 0", "Day 0", "Day 1", "Day 2", "Day 3", "Day 3", "Day 4", "Day 4"];
  const oldTitles = [
    "Cold outreach sent",
    "Prospect replied",
    "Discovery call booked",
    "IT Director added to thread",
    "Discovery call held",
    "Proposal sent",
    "CISO approved",
    "Deal closed \u2713",
  ];
  const oldDescs = [
    "EOL firewall risk framing \u2014 no product pitch",
    "Cited active EOL concern; requested call",
    "Rep + Retail Security Specialist confirmed for Day 3",
    "Stakeholder expansion \u2014 Gimli looped in by champion",
    "Technical questions on SIEM integration answered",
    "200-seat XDR deployment + 40% TCO vs Fortinet",
    "Unanimous \u2014 signed order form same day",
    "Onboarding team engaged within 24 hours",
  ];

  const msgs = thread.messages;
  for (let i = 0; i < 8; i++) {
    const m = msgs[i];
    if (m) {
      const senderType = isSeller(m.from.emailAddress.address) ? "Rep" : "Prospect";
      x = rt(x, oldDays[i], dayLabel(thread, i));
      x = rt(x, oldTitles[i], `${senderType}: ${m.from.emailAddress.name}`);
      x = rt(x, oldDescs[i], truncate(m.bodyPreview, 80));
    } else if (i < oldTitles.length) {
      x = rt(x, oldTitles[i], "\u2014");
      x = rt(x, oldDescs[i], "");
    }
  }

  return x;
}

function wonSlide5(
  xml: string,
  company: string,
  date: string,
  thread: EmailThread,
  health: ThreadHealth,
): string {
  let x = xml;
  x = rt(
    x,
    "Sophos Confidential  |  DealTrace Case Study: Mirkwood Retail Group  |  March 14, 2026",
    `Sophos Confidential  |  DealTrace Case Study: ${company}  |  ${date}`,
  );

  const signals = deriveSignals(thread, true);
  const oldTitles = [
    "Urgency Trigger",
    "Same-Day Reply",
    "Stakeholder Expansion",
    "No Price Objection",
    "Fast Proposal Delivery",
    "Competitor Mentioned",
  ];
  const oldDescs = [
    "EOL hardware + 6-month audit deadline",
    "Prospect replied within 2 hours of cold outreach",
    "IT Director added unprompted in reply #4",
    "Proposal accepted without pushback",
    "Proposal sent within 24hrs of discovery call",
    "No competitor comparison required",
  ];

  for (let i = 0; i < 6; i++) {
    const s = signals[i];
    if (s) {
      x = rt(x, oldTitles[i], s.title);
      x = rt(x, oldDescs[i], s.desc);
    } else {
      x = rt(x, oldTitles[i], "\u2014");
      x = rt(x, oldDescs[i], "");
    }
  }

  const positiveCount = signals.length;
  x = rt(x, "83", `${health.healthScore}`);
  x = rt(x, "5 of 6 win signals present", `${positiveCount} of 6 win signals present`);

  return x;
}

function wonSlide6(
  xml: string,
  company: string,
  date: string,
  health: ThreadHealth,
): string {
  let x = xml;
  x = rt(
    x,
    "Sophos Confidential  |  DealTrace Case Study: Mirkwood Retail Group  |  March 14, 2026",
    `Sophos Confidential  |  DealTrace Case Study: ${company}  |  ${date}`,
  );

  const oldTitles = [
    "Lead with the problem, not the product",
    "Bring a specialist to the first call",
    "Send proposal within 24hrs of discovery",
    "TCO framing beats price objections",
    "Let the champion expand the stakeholders",
  ];
  const oldDescs = [
    "The cold email mentioned EOL risk \u2014 not Sophos. Prospect self-identified.",
    "Retail Security Specialist joined Day 3 call \u2014 answered SIEM questions on the spot.",
    "No delay = no cooling off. Rep sent same-day after the call.",
    "3-year TCO 40% below Fortinet stack \u2014 eliminated pricing as a conversation entirely.",
    "Rep never asked for Gimli intro \u2014 Legolas added him unprompted after seeing value.",
  ];

  const factors = health.winFactors;
  const recs = health.recommendations;
  for (let i = 0; i < 5; i++) {
    const title = factors[i]
      ? truncate(factors[i].split(/[,—.]/)[0].trim(), 50)
      : "\u2014";
    const desc = recs[i] ?? factors[i] ?? "";
    x = rt(x, oldTitles[i], title);
    x = rt(x, oldDescs[i], truncate(desc, 120));
  }

  return x;
}

function wonSlide7(
  xml: string,
  company: string,
  date: string,
  thread: EmailThread,
  health: ThreadHealth,
  days: number,
): string {
  let x = xml;
  x = rt(
    x,
    "Sophos Confidential  |  DealTrace Case Study: Mirkwood Retail Group  |  March 14, 2026",
    `Sophos Confidential  |  DealTrace Case Study: ${company}  |  ${date}`,
  );

  // Customer quote
  const prospectMsgs = thread.messages.filter(
    (m) => !isSeller(m.from.emailAddress.address),
  );
  const quoteMsg = prospectMsgs[prospectMsgs.length - 1] ?? prospectMsgs[0];
  const quoteText = quoteMsg
    ? truncate(quoteMsg.bodyPreview, 160)
    : "Strong engagement from the Sophos team throughout.";
  const quoterName = quoteMsg?.from.emailAddress.name ?? "Client";

  x = rt(
    x,
    "Nicaela moved faster than any vendor I've worked with. From first email to signed contract in 4 days \u2014 exactly what we needed before our audit.",
    quoteText,
  );
  x = rt(
    x,
    "\u2014 Legolas Greenleaf, VP IT \u2014 Mirkwood Retail Group",
    `\u2014 ${quoterName} \u2014 ${company}`,
  );

  // KPI boxes
  x = rt(x, "$142,000", `${health.healthScore}%`);
  x = rt(x, "Contract Value", "Health Score");
  x = rt(x, "4 Days", `${days} Days`);
  x = rt(x, "0", `${prospectMsgs.length}`);
  x = rt(x, "Price Objections", "Prospect Replies");
  x = rt(x, "24hrs", `${thread.messages.length} msgs`);
  x = rt(x, "Onboarding Start", "Thread Length");

  return x;
}

function wonSlide8(
  xml: string,
  health: ThreadHealth,
): string {
  let x = xml;
  const recs = health.recommendations;
  const oldActions = [
    "Identify accounts with EOL hardware, upcoming audits, or recent breach events",
    "Lead with the risk problem \u2014 not the product \u2014 in cold outreach",
    "Target CISO or IT Director from day one; don't get stuck with a gatekeeper",
    "Commit to proposal delivery within 24 hours of the discovery call",
    "Run DealTrace on your current pipeline to find threads that match this profile",
  ];
  for (let i = 0; i < 5; i++) {
    if (recs[i]) x = rt(x, oldActions[i], recs[i]);
  }
  return x;
}

// ── LOST template replacements ───────────────────────────────────────────────

function lostSlide1(
  xml: string,
  company: string,
  product: string,
  days: number,
  msgs: number,
  date: string,
  lossReason: string,
  seller: string,
  score: number,
): string {
  let x = xml;
  x = rt(x, "Howard Hamlin & Associates", company);
  x = rt(x, "Retail  \u00b7  APAC", "Cybersecurity");
  x = rt(x, "$180,000", `${score}%`);
  x = rt(x, "Budget Mismatch", lossReason);
  x = rt(x, "3 days", `${days} days`);
  x = rt(x, "150", `${msgs}`);
  x = rt(x, "January 17, 2026", date);
  x = rt(x, "PROPOSAL VALUE", "RISK SCORE");
  x = rt(x, "SEATS", "EMAILS");
  x = rt(x, "Nicaela Cabuhat  \u00b7  Sales Engineer", seller);
  return x;
}

function lostSlide2(
  xml: string,
  company: string,
  product: string,
  days: number,
  msgs: number,
  date: string,
  score: number,
  health: ThreadHealth,
): string {
  let x = xml;
  x = rt(
    x,
    "Sophos Confidential  |  DealTrace Case Study: Howard Hamlin & Associates  |  January 17, 2026",
    `Sophos Confidential  |  DealTrace Case Study: ${company}  |  ${date}`,
  );
  x = rt(x, "$180,000", `${score}%`);
  x = rt(x, "Proposal Value", "Risk Score");
  x = rt(x, "Full ZTNA + XDR scope", `${score <= 30 ? "Critical" : "At Risk"}`);
  x = rt(x, "3d", `${days}d`);
  x = rt(x, "Before disengagement", "Before disengagement");
  x = rt(x, "150", `${msgs}`);
  x = rt(x, "Target Seats", "Emails");
  x = rt(x, "150-user firm", `${msgs}-email thread`);
  x = rt(x, "6", `${msgs}`);
  x = rt(x, "Legal Services", "Technology");
  x = rt(x, "EMEA", "\u2014");
  x = rt(x, "150 employees \u00b7 1 office", company);
  x = rt(x, "Sophos ZTNA + XDR Bundle", product);
  x = rt(x, "None \u2014 stayed with incumbent", "\u2014");

  // What was missing
  const risks = health.riskFactors;
  const oldMissing = [
    "No discovery call \u2014 budget never validated",
    "No CISO or IT Director in thread",
    "No urgency trigger or compliance deadline",
    "No ROI / TCO framing before pricing",
  ];
  for (let i = 0; i < 4; i++) {
    if (risks[i]) x = rt(x, oldMissing[i], truncate(risks[i], 80));
  }

  return x;
}

function lostSlide3(
  xml: string,
  company: string,
  date: string,
  thread: EmailThread,
  health: ThreadHealth,
  lossReason: string,
): string {
  let x = xml;
  x = rt(
    x,
    "Sophos Confidential  |  DealTrace Case Study: Howard Hamlin & Associates  |  January 17, 2026",
    `Sophos Confidential  |  DealTrace Case Study: ${company}  |  ${date}`,
  );

  const msgs = thread.messages;
  const firstSeller = msgs.find((m) => isSeller(m.from.emailAddress.address));
  const firstProspect = msgs.find(
    (m) => !isSeller(m.from.emailAddress.address),
  );
  const midIdx = Math.min(Math.floor(msgs.length / 2), msgs.length - 1);
  const lastMsg = msgs[msgs.length - 1];
  const penultimate = msgs[Math.max(0, msgs.length - 2)];

  x = rt(
    x,
    "Evaluating ZTNA and endpoint protection upgrade for 150-user firm",
    truncate(firstSeller?.bodyPreview ?? thread.subject, 120),
  );
  x = rt(
    x,
    "Prospect engaged promptly but immediately asked for pricing \u2014 no discovery call",
    truncate(firstProspect?.bodyPreview ?? "Initial prospect engagement", 120),
  );
  x = rt(
    x,
    "Budget expectation of ~$80K stated in reply #4 \u2014 55% below proposal value",
    truncate(msgs[midIdx]?.bodyPreview ?? "Mid-cycle signal detected", 120),
  );
  x = rt(
    x,
    "Rep offered trimmed 100-seat endpoint-only scope at ~$90K \u2014 still above stated budget",
    truncate(penultimate.bodyPreview, 120),
  );
  x = rt(
    x,
    "Howard stated they are going in a different direction \u2014 no further engagement",
    truncate(lastMsg.bodyPreview, 120),
  );
  x = rt(
    x,
    "Primary loss reason: Budget Mismatch  \u00b7  Competitor: None \u2014 stayed with incumbent",
    `Primary loss reason: ${lossReason}`,
  );

  return x;
}

function lostSlide4(
  xml: string,
  company: string,
  date: string,
  thread: EmailThread,
  days: number,
): string {
  let x = xml;
  x = rt(
    x,
    "Sophos Confidential  |  DealTrace Case Study: Howard Hamlin & Associates  |  January 17, 2026",
    `Sophos Confidential  |  DealTrace Case Study: ${company}  |  ${date}`,
  );
  x = rt(
    x,
    "3 days \u2014 from outreach to disengagement",
    `${days} days \u2014 from outreach to disengagement`,
  );

  const oldDays = ["Day 0", "Day 0", "Day 1", "Day 1", "Day 2", "Day 3"];
  const oldTitles = [
    "Cold outreach sent",
    "Howard replied",
    "Pricing sent",
    "Budget concern raised",
    "Revised scope offered",
    "Deal lost",
  ];
  const oldDescs = [
    "ZTNA + endpoint protection upgrade pitch",
    "Interested \u2014 asked for pricing immediately",
    "$180K full-scope ZTNA + XDR, 150 users",
    "Expected ~$80K \u2014 significant gap flagged",
    "100-seat endpoint-only at ~$90K",
    "Going in a different direction \u2014 no further engagement",
  ];

  const msgs = thread.messages;
  for (let i = 0; i < 6; i++) {
    const m = msgs[i];
    if (m) {
      const senderType = isSeller(m.from.emailAddress.address) ? "Rep" : "Prospect";
      x = rt(x, oldDays[i], dayLabel(thread, i));
      x = rt(x, oldTitles[i], `${senderType}: ${m.from.emailAddress.name}`);
      x = rt(x, oldDescs[i], truncate(m.bodyPreview, 80));
    } else if (i < oldTitles.length) {
      x = rt(x, oldTitles[i], "\u2014");
      x = rt(x, oldDescs[i], "");
    }
  }

  return x;
}

function lostSlide5(
  xml: string,
  company: string,
  date: string,
  thread: EmailThread,
  health: ThreadHealth,
): string {
  let x = xml;
  x = rt(
    x,
    "Sophos Confidential  |  DealTrace Case Study: Howard Hamlin & Associates  |  January 17, 2026",
    `Sophos Confidential  |  DealTrace Case Study: ${company}  |  ${date}`,
  );

  const signals = deriveSignals(thread, false);
  const oldTitles = [
    "No Discovery Call",
    "Budget Below Proposal",
    "Single Stakeholder",
    "No Urgency Trigger",
    "Slow Prospect Response",
    "Competitor Comparison",
  ];
  const oldDescs = [
    "Prospect skipped discovery; jumped straight to pricing",
    "Stated $80K budget vs $180K proposal \u2014 55% gap",
    "Only Howard engaged \u2014 no CISO or IT Director in thread",
    "No breach, audit, or compliance deadline cited",
    "48+ hour reply times after proposal",
    "No competitor named \u2014 stayed with incumbent vendor",
  ];

  for (let i = 0; i < 6; i++) {
    const s = signals[i];
    if (s) {
      x = rt(x, oldTitles[i], s.title);
      x = rt(x, oldDescs[i], s.desc);
    } else {
      x = rt(x, oldTitles[i], "\u2014");
      x = rt(x, oldDescs[i], "");
    }
  }

  const negCount = signals.length;
  x = rt(x, "83", `${health.healthScore}`);
  x = rt(x, "5 of 6 loss signals present", `${negCount} of 6 loss signals present`);

  return x;
}

function lostSlide6(
  xml: string,
  company: string,
  date: string,
  health: ThreadHealth,
): string {
  let x = xml;
  x = rt(
    x,
    "Sophos Confidential  |  DealTrace Case Study: Howard Hamlin & Associates  |  January 17, 2026",
    `Sophos Confidential  |  DealTrace Case Study: ${company}  |  ${date}`,
  );

  // Post-mortem: 4 phases with mistake, impact, fix
  const risks = health.riskFactors;
  const recs = health.recommendations;

  const oldMistakes = [
    "Skipped discovery call",
    "Sent full-scope $180K proposal without anchoring",
    "Never escalated beyond Howard",
    "Scope reduction without new value framing",
  ];
  const oldImpacts = [
    "Rep never validated budget authority or confirmed real spend capacity before sending proposal",
    "Prospect had a $80K expectation \u2014 the gap was too large to bridge with a scope trim",
    "Howard had no authority to approve $180K. No CISO or IT Director was ever in the thread.",
    "Trimming to $90K felt like a discount rather than a new solution \u2014 didn't reset the conversation",
  ];
  const oldFixes = [
    "\u2192  Always run a 20-min discovery call before any proposal. Budget confirmation is non-negotiable.",
    "\u2192  Anchor with a value-based ROI frame before revealing price. Send TCO comparison, not just a quote.",
    "\u2192  Ask for CISO/IT Director introduction in reply #2 on every deal above $50K.",
    "\u2192  When pivoting on scope, reframe the value entirely. Present as a new phase-1 deployment plan.",
  ];

  for (let i = 0; i < 4; i++) {
    const risk = risks[i];
    const rec = recs[i];
    if (risk) {
      x = rt(x, oldMistakes[i], truncate(risk.split(/[,—.]/)[0].trim(), 50));
      x = rt(x, oldImpacts[i], truncate(risk, 120));
    }
    if (rec) {
      x = rt(x, oldFixes[i], `\u2192  ${truncate(rec, 120)}`);
    }
  }

  return x;
}

function lostSlide7(
  xml: string,
  company: string,
  date: string,
  health: ThreadHealth,
): string {
  let x = xml;
  x = rt(
    x,
    "Sophos Confidential  |  DealTrace Case Study: Howard Hamlin & Associates  |  January 17, 2026",
    `Sophos Confidential  |  DealTrace Case Study: ${company}  |  ${date}`,
  );

  // Save points — use recommendations
  const recs = health.recommendations;
  const oldSaves = [
    "Book discovery call before sending any pricing",
    "Ask: 'What budget has been approved for this?' before building proposal",
    "Lead with TCO vs incumbent rather than raw price",
    "Escalate: 'Can we loop in your CISO to discuss the security ROI?'",
  ];
  for (let i = 0; i < 4; i++) {
    if (recs[i]) x = rt(x, oldSaves[i], truncate(recs[i], 80));
  }

  // Rules for next time
  const oldRules = [
    "Run discovery before every proposal \u2014 qualify budget authority in the first call",
    "Ask the budget question directly: 'What envelope has been approved for this initiative?'",
    "Never send a proposal more than 30% above stated budget without an ROI bridge",
    "Get CISO or IT Director on record before mid-stage \u2014 no single-contact deals above $50K",
    "If budget gap exists, reframe scope as Phase 1 \u2014 not a discounted version of the same thing",
  ];
  const allRecs = [...recs];
  for (let i = 0; i < 5; i++) {
    const rec = allRecs[i];
    if (rec) x = rt(x, oldRules[i], truncate(rec, 100));
  }

  return x;
}

function lostSlide8(
  xml: string,
  health: ThreadHealth,
): string {
  let x = xml;
  const recs = health.recommendations;
  const risks = health.riskFactors;

  const oldTitles = ["Qualify First", "Find the Power", "Frame the Value"];
  const oldDescs = [
    "Budget authority must be confirmed before any proposal leaves your desk",
    "Single contact deals above $50K almost never close \u2014 get to the CISO",
    "Lead with TCO and breach risk reduction before revealing the price tag",
  ];

  for (let i = 0; i < 3; i++) {
    const title = risks[i]
      ? truncate(risks[i].split(/[,—.]/)[0].trim(), 30)
      : oldTitles[i];
    const desc = recs[i] ?? oldDescs[i];
    x = rt(x, oldTitles[i], title);
    x = rt(x, oldDescs[i], truncate(desc, 100));
  }

  return x;
}

// ── Main entry ──────────────────────────────────────────────────────────────

export async function generateCaseStudy(
  thread: EmailThread,
  health: ThreadHealth,
): Promise<Buffer> {
  const isWon = health.outcome === "won";
  const templateFile = isWon
    ? "template_casestudy-won.pptx"
    : "template_casestudy-lost.pptx";
  const template = readFileSync(path.join(TEMPLATES_DIR, templateFile));
  const zip = await JSZip.loadAsync(template);

  const company = deriveCompany(thread);
  const product = thread.product ?? "Sophos Solution";
  const days = deriveDays(thread);
  const msgs = thread.messages.length;
  const date = deriveCloseDate(thread);
  const score = health.healthScore;
  const prospects = getProspects(thread);
  const seller = getSellerName(thread);
  const lossReason = deriveLossReason(health);
  const trigger = thread.messages[0]?.bodyPreview ?? thread.subject;

  const slideFiles = Array.from({ length: 8 }, (_, i) => `ppt/slides/slide${i + 1}.xml`);

  for (const filePath of slideFiles) {
    const file = zip.file(filePath);
    if (!file) continue;
    let xml = await file.async("string");
    const slideNum = parseInt(filePath.match(/slide(\d+)/)?.[1] ?? "0");

    if (isWon) {
      switch (slideNum) {
        case 1:
          xml = wonSlide1(xml, company, product, days, msgs, date, score, seller);
          break;
        case 2:
          xml = wonSlide2(xml, company, product, days, msgs, date, score, prospects, trigger);
          break;
        case 3:
          xml = wonSlide3(xml, company, date, thread, health, prospects, seller);
          break;
        case 4:
          xml = wonSlide4(xml, company, date, thread, days);
          break;
        case 5:
          xml = wonSlide5(xml, company, date, thread, health);
          break;
        case 6:
          xml = wonSlide6(xml, company, date, health);
          break;
        case 7:
          xml = wonSlide7(xml, company, date, thread, health, days);
          break;
        case 8:
          xml = wonSlide8(xml, health);
          break;
      }
    } else {
      switch (slideNum) {
        case 1:
          xml = lostSlide1(xml, company, product, days, msgs, date, lossReason, seller, score);
          break;
        case 2:
          xml = lostSlide2(xml, company, product, days, msgs, date, score, health);
          break;
        case 3:
          xml = lostSlide3(xml, company, date, thread, health, lossReason);
          break;
        case 4:
          xml = lostSlide4(xml, company, date, thread, days);
          break;
        case 5:
          xml = lostSlide5(xml, company, date, thread, health);
          break;
        case 6:
          xml = lostSlide6(xml, company, date, health);
          break;
        case 7:
          xml = lostSlide7(xml, company, date, health);
          break;
        case 8:
          xml = lostSlide8(xml, health);
          break;
      }
    }

    zip.file(filePath, xml);
  }

  return (await zip.generateAsync({ type: "nodebuffer" })) as Buffer;
}
