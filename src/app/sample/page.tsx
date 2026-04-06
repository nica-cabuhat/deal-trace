"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Content, Root, Trigger } from "@radix-ui/react-collapsible";
import caseStudiesData from "@/lib/data/case-studies.json";
import type { EmailMessage, EmailThread } from "@/lib/types/thread";
import { useMailboxConversation } from "@/lib/outlook/useMailboxConversation";
import { useAnalyze } from "@/lib/queries/useAnalyze";
import { useScore, type ThreadHealth } from "@/lib/queries/useScore";
import { useConversationThread } from "@/lib/queries/useConversationThread";
import ThreadList from "@/components/playbook/ThreadList";
import ThreadScore from "@/components/playbook/ThreadScore";
import TagBadge from "@/components/playbook/TagBadge";
import type { PatternStats } from "@/lib/deal/patternLibrary";

interface CaseStudyEntry {
  conversationId: string;
  subject: string;
  product?: string;
  mainContact?: string;
  threadTags: EmailThread["threadTags"];
  messages: EmailMessage[];
  health: ThreadHealth;
}

const caseStudies = caseStudiesData as unknown as CaseStudyEntry[];

const cachedThreads: EmailThread[] = caseStudies.map((cs) => ({
  conversationId: cs.conversationId,
  subject: cs.subject,
  product: cs.product,
  mainContact: cs.mainContact,
  threadTags: cs.threadTags,
  messages: cs.messages,
}));

const cachedHealthMap: Record<string, ThreadHealth> = Object.fromEntries(
  caseStudies.map((cs) => [cs.conversationId, cs.health]),
);

const patternStats: PatternStats = {
  total: caseStudies.length,
  won: caseStudies.filter((cs) => cs.health.outcome === "won").length,
  lost: caseStudies.filter((cs) => cs.health.outcome === "lost").length,
  stalled: caseStudies.filter((cs) => cs.health.outcome !== "won" && cs.health.outcome !== "lost").length,
};

/** Strip Exchange legacy DN paths from sender display names. */
function cleanName(raw: string): string {
  return raw.replace(/\s*<?\/?O=.*$/i, "").trim() || raw;
}

function isEmail(addr: string): boolean {
  return addr.includes("@");
}

const SELLER_DOMAIN = "sophos.com";

const SOPHOS_PRODUCT_KEYWORDS =
  /\b(sophos|intercept\s*x|mdr|xdr|firewall|central|endpoint|ztna|cyber\s*security|threat\s*protect|ransomware\s*protect|proof\s*of\s*concept|poc)\b/i;

const DEAL_STAGE_KEYWORDS =
  /\b(pricing|quote|proposal|demo|trial|purchase\s*order|PO\b|contract|procurement|budget|roi|deployment|implementation|onboarding|pilot)\b/i;

const NON_DEAL_KEYWORDS =
  /\b(hmo|benefits|payroll|company\s*id|employee\s*id|registration\s*deadline|batch\s*processing|hr\s*department|human\s*resources|leave\s*request|time\s*off|attendance|performance\s*review|onboarding\s*form|tax\s*form|w-?2|w-?4|1099|pay\s*stub|direct\s*deposit|open\s*enrollment|health\s*insurance|dental|vision|401k|retirement|pto|sick\s*leave|maternity|paternity|training\s*session|team\s*building|office\s*closure|holiday\s*schedule|memo|announcement|newsletter|bulletin|survey|feedback\s*form|it\s*support|password\s*reset|vpn|wifi|parking|badge|key\s*card|cafeteria)\b/i;

const SYSTEM_SENDERS =
  /\b(noreply|no-reply|account-security|mailer-daemon|postmaster|notifications?|support@|billing@|newsletter|hr@|human\.?resources|admin@|helpdesk)\b/i;

function isDealEmail(thread: EmailThread): boolean {
  const allText = thread.messages
    .map((m) => `${m.subject} ${m.bodyPreview}`)
    .join(" ");

  if (NON_DEAL_KEYWORDS.test(allText)) return false;

  const allSystem = thread.messages.every((m) => {
    const addr = m.from.emailAddress.address.toLowerCase();
    return (
      SYSTEM_SENDERS.test(addr) ||
      addr.endsWith("@microsoft.com") ||
      addr.endsWith("@accountprotection.microsoft.com")
    );
  });
  if (allSystem) return false;

  const domains = new Set(
    thread.messages.map(
      (m) => m.from.emailAddress.address.toLowerCase().split("@")[1],
    ),
  );
  const hasSellerDomain = domains.has(SELLER_DOMAIN);
  const hasExternalDomain = [...domains].some((d) => d !== SELLER_DOMAIN);
  const isCrossDomain = hasSellerDomain && hasExternalDomain;

  if (SOPHOS_PRODUCT_KEYWORDS.test(allText) && isCrossDomain) return true;
  if (DEAL_STAGE_KEYWORDS.test(allText) && isCrossDomain) return true;

  return false;
}

function DevMailboxHint() {
  return (
    <p
      role="note"
      className="px-4 pt-2 text-center text-xs leading-snug"
      style={{ color: "var(--color-gray-450)" }}
    >
      The Outlook add-in loads <code className="font-mono">/taskpane</code> with
      Office.js. On this page use query params to simulate a message, e.g.{" "}
      <code className="font-mono">?subject=Your+Subject</code> or{" "}
      <code className="font-mono">?conv=…</code>.
    </p>
  );
}

function AppHeader() {
  return (
    <header
      className="flex items-center justify-between border-b px-4 py-3"
      style={{ borderColor: "var(--color-gray-200)", background: "white" }}
    >
      <div className="flex items-center gap-2">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.5C16.5 22.15 20 17.25 20 12V6L12 2z"
            fill="var(--color-sophos-blue)"
          />
          <path
            d="M9 12l2 2 4-4"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span
          className="text-sm font-bold"
          style={{ color: "var(--color-sophos-blue)" }}
        >
          DealTrace
        </span>
      </div>
      <button
        type="button"
        onClick={() => {
          try {
            Office?.context?.ui?.closeContainer?.();
          } catch {
            window.location.href = window.location.pathname;
          }
        }}
        className="rounded p-1.5 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-sophos-blue)"
        aria-label="Close and reopen for current email"
        title="Close — reopen from ribbon to sync"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-gray-500)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 2v6h-6" />
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
          <path d="M3 22v-6h6" />
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        </svg>
      </button>
    </header>
  );
}

function MessageRow({ message }: { message: EmailMessage }) {
  const dt = new Date(message.receivedDateTime);
  const datePart = dt.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const timePart = dt.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div
      className="border-t py-2.5 first:border-t-0"
      style={{ borderColor: "var(--color-gray-150)" }}
    >
      <div className="mb-0.5 flex items-baseline justify-between gap-2">
        <p
          className="text-xs font-medium flex flex-col"
          style={{ color: "var(--color-gray-800)" }}
        >
          {cleanName(message.from.emailAddress.name)}
          {isEmail(message.from.emailAddress.address) && (
            <span
              className="font-normal"
              style={{ color: "var(--color-gray-500)" }}
            >
              &lt;{message.from.emailAddress.address}&gt;
            </span>
          )}
        </p>
        <p className="shrink-0 text-right text-xs" style={{ color: "var(--color-gray-450)" }}>
          <span>{datePart}</span>
          <br />
          <span>{timePart}</span>
        </p>
      </div>
      <p className="text-xs" style={{ color: "var(--color-gray-600)" }}>
        {message.bodyPreview}
      </p>
      {message.tags && message.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {message.tags.map((tag, i) => (
            <TagBadge key={`${tag.signal}-${i}`} tag={tag} />
          ))}
        </div>
      )}
    </div>
  );
}

function SelectedThreadCard({ thread }: { thread: EmailThread }) {
  const [open, setOpen] = useState(false);

  return (
    <article
      className="overflow-hidden rounded-lg border bg-white"
      style={{
        borderColor: "var(--color-gray-200)",
        boxShadow: "var(--shadow-card-light)",
      }}
    >
      <Root open={open} onOpenChange={setOpen}>
        <Trigger
          type="button"
          className="w-full p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--color-sophos-blue) [&[data-state=open]_svg]:rotate-180"
          aria-expanded={open}
        >
          <div className="mb-1 flex items-start justify-between gap-2">
            <h3
              className="flex-1 truncate text-sm font-semibold"
              style={{ color: "var(--color-gray-900)" }}
            >
              {thread.subject}
            </h3>
            <svg
              className="h-4 w-4 shrink-0 transition-transform"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
              style={{ color: "var(--color-gray-400)" }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
          {(() => {
            const contact = thread.messages.find(
              (m) =>
                !m.from.emailAddress.address
                  .toLowerCase()
                  .includes(SELLER_DOMAIN),
            );
            const contactName = contact
              ? cleanName(contact.from.emailAddress.name)
              : cleanName(thread.messages[0]?.from.emailAddress.name ?? "");
            const contactEmail =
              contact?.from.emailAddress.address ??
              thread.messages[0]?.from.emailAddress.address;
            return contactName ? (
              <p
                className="mb-1.5 flex flex-col text-xs"
                style={{ color: "var(--color-gray-500)" }}
              >
                <span>{contactName}</span>
                {contactEmail && isEmail(contactEmail) && (
                  <span className="opacity-70">&lt;{contactEmail}&gt;</span>
                )}
                <span className="opacity-50">
                  {thread.messages.length} message
                  {thread.messages.length !== 1 ? "s" : ""}
                </span>
              </p>
            ) : null;
          })()}
          {thread.product && (
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
              style={{
                background: "var(--color-blue-35)",
                color: "var(--color-sophos-blue)",
              }}
            >
              {thread.product}
            </span>
          )}
        </Trigger>

        <Content>
          <div
            className="border-t px-3 pb-2"
            style={{ borderColor: "var(--color-gray-150)" }}
          >
            {thread.messages.map((message) => (
              <MessageRow key={message.id} message={message} />
            ))}
          </div>
        </Content>
      </Root>
    </article>
  );
}

export default function SamplePage() {
  const [showSampleDevHint, setShowSampleDevHint] = useState(false);
  const [urlMailboxConversationId, setUrlMailboxConversationId] = useState<
    string | null
  >(null);
  const [urlMailboxSubject, setUrlMailboxSubject] = useState<string | null>(
    null,
  );

  // ── State B: live thread from real Outlook conversation ────────────────────
  const [liveThread, setLiveThread] = useState<EmailThread | null>(null);
  const [liveHealth, setLiveHealth] = useState<ThreadHealth | null>(null);
  const [isLiveAnalyzing, setIsLiveAnalyzing] = useState(false);
  const [isLiveScoring, setIsLiveScoring] = useState(false);
  const [liveDraftingId, setLiveDraftingId] = useState<string | null>(null);
  const [liveProjectedScore, setLiveProjectedScore] = useState<
    number | undefined
  >();
  const [isAllThreadsOpen, setIsAllThreadsOpen] = useState(false);
  const lastLiveConvId = useRef<string | null>(null);

  const { mutateAsync: analyze } = useAnalyze();
  const { mutateAsync: scoreThread } = useScore();

  useEffect(() => {
    const path = window.location.pathname;
    setShowSampleDevHint(path === "/sample" || path.endsWith("/sample"));
  }, []);

  const { conversationId: officeConversationId, itemSubject: officeSubject } =
    useMailboxConversation({
      onConversationChanged: () => {
        setLiveThread(null);
        setLiveHealth(null);
        setLiveProjectedScore(undefined);
        setIsLiveAnalyzing(false);
        setIsLiveScoring(false);
        lastLiveConvId.current = null;
      },
    });

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setUrlMailboxConversationId(p.get("conv") ?? p.get("mailboxConversation"));
    setUrlMailboxSubject(p.get("subject"));
  }, []);

  const mailboxConversationId =
    officeConversationId ?? urlMailboxConversationId;
  const mailboxSubject = officeSubject ?? urlMailboxSubject;
  const hasMailboxContext = !!(mailboxConversationId || mailboxSubject);

  // Fetch conversation from Microsoft Graph API
  const {
    data: conversationResult,
    isLoading: isLoadingConversation,
    refetch: refetchConversation,
  } = useConversationThread(mailboxConversationId, mailboxSubject);

  const fetchedThread = conversationResult?.thread ?? null;
  const isUnauthorized = conversationResult?.isUnauthorized ?? false;

  // Derived synchronously — no effect needed for deal detection
  const selectedIsDeal = fetchedThread ? isDealEmail(fetchedThread) : null;

  const handleSignIn = useCallback(() => {
    const popup = window.open(
      "/api/auth/signin/azure-ad?callbackUrl=/auth-complete",
      "dealtrace-auth",
      "width=500,height=700,popup=1",
    );
    if (!popup) return;
    const poll = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(poll);
        void refetchConversation();
      }
    }, 500);
  }, [refetchConversation]);

  // ── Auto-analyze & score the live thread when it arrives ───────────────────
  useEffect(() => {
    if (!fetchedThread) {
      if (!isLoadingConversation && lastLiveConvId.current) {
        setLiveThread(null);
        setLiveHealth(null);
        lastLiveConvId.current = null;
      }
      return;
    }

    if (!isDealEmail(fetchedThread)) {
      setLiveThread(null);
      lastLiveConvId.current = null;
      return;
    }

    if (lastLiveConvId.current === fetchedThread.conversationId) return;
    lastLiveConvId.current = fetchedThread.conversationId;
    setLiveHealth(null);
    setLiveProjectedScore(undefined);

    const run = async () => {
      setIsLiveAnalyzing(true);
      try {
        const result = await analyze(fetchedThread.messages);
        const analyzed: EmailThread = {
          ...fetchedThread,
          messages: result.messages,
          threadTags: result.threadTags,
          product: result.product ?? fetchedThread.product,
          mainContact: result.mainContact ?? fetchedThread.mainContact,
        };
        setLiveThread(analyzed);
        setIsLiveAnalyzing(false);

        setIsLiveScoring(true);
        const health = await scoreThread({ thread: analyzed });
        setLiveHealth(health);
      } catch (err) {
        console.error("[live] Analysis/scoring failed", err);
        setLiveThread(fetchedThread);
      } finally {
        setIsLiveAnalyzing(false);
        setIsLiveScoring(false);
      }
    };

    void run();
  }, [fetchedThread, isLoadingConversation, analyze, scoreThread]);

  const handleLiveDraft = useCallback(
    async (thread: EmailThread) => {
      setLiveDraftingId(thread.conversationId);
      try {
        const result = await scoreThread({ thread, includeDraft: true });

        setLiveHealth((prev) => {
          const base = prev ?? result;
          const boost =
            base.healthScore >= 80 ? 5 : base.healthScore >= 50 ? 10 : 15;
          setLiveProjectedScore(Math.min(98, base.healthScore + boost));
          return { ...base, draftEmail: result.draftEmail };
        });
      } finally {
        setLiveDraftingId(null);
      }
    },
    [scoreThread],
  );

  // ── Determine which state to render ─────────────────────────────────────────
  const showStateB =
    hasMailboxContext && selectedIsDeal === true && !isUnauthorized;

  // ── STATE B: active deal thread selected ──────────────────────────────────
  if (showStateB) {
    if (isLoadingConversation || isLiveAnalyzing) {
      return (
        <div
          className="flex min-h-screen flex-col"
          style={{ background: "var(--color-gray-50)" }}
        >
          <AppHeader />
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
              style={{
                borderColor: "var(--color-sophos-blue)",
                borderTopColor: "transparent",
              }}
            />
            <p className="text-sm" style={{ color: "var(--color-gray-500)" }}>
              {isLoadingConversation
                ? "Loading conversation from Outlook…"
                : "Analyzing deal signals…"}
            </p>
          </div>
        </div>
      );
    }

    if (liveThread) {
      const t = liveThread;
      return (
        <div
          className="flex min-h-screen flex-col"
          style={{ background: "var(--color-gray-50)" }}
        >
          <AppHeader />
          {showSampleDevHint && <DevMailboxHint />}
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
            <h2
              className="text-sm font-semibold"
              style={{ color: "var(--color-gray-600)" }}
            >
              Selected Deal Thread
            </h2>

            <SelectedThreadCard thread={t} />

            <ThreadScore
              health={liveHealth ?? undefined}
              isLoading={isLiveScoring}
              onRequestDraft={() => void handleLiveDraft(t)}
              isDraftLoading={liveDraftingId === t.conversationId}
              projectedScore={liveProjectedScore}
              isProjecting={false}
            />

            <section aria-label="All deal threads">
              <button
                type="button"
                className="w-full rounded-md border py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-sophos-blue)"
                style={{
                  borderColor: "var(--color-gray-300)",
                  color: "var(--color-gray-600)",
                  background: "white",
                }}
                onClick={() => setIsAllThreadsOpen((v) => !v)}
                aria-expanded={isAllThreadsOpen}
              >
                {isAllThreadsOpen
                  ? "Hide Deal Threads"
                  : "Show All Deal Threads"}
              </button>

              {isAllThreadsOpen && (
                <div className="mt-3 flex flex-col gap-3">
                  <button
                    type="button"
                    className="w-full rounded-md py-2.5 text-sm font-medium text-white"
                    style={{ background: "var(--color-sophos-blue)" }}
                  >
                    Download Rep Playbook
                  </button>
                  <ThreadList
                    threads={cachedThreads}
                    healthMap={cachedHealthMap}
                  />
                </div>
              )}
            </section>
          </div>
        </div>
      );
    }

    // Deal detected but analysis hasn't started yet — show spinner
    return (
      <div
        className="flex min-h-screen flex-col"
        style={{ background: "var(--color-gray-50)" }}
      >
        <AppHeader />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
            style={{
              borderColor: "var(--color-sophos-blue)",
              borderTopColor: "transparent",
            }}
          />
          <p className="text-sm" style={{ color: "var(--color-gray-500)" }}>
            Analyzing deal signals…
          </p>
        </div>
      </div>
    );
  }

  // ── Loading / auth states ─────────────────────────────────────────────────
  if (hasMailboxContext && isLoadingConversation) {
    return (
      <div
        className="flex min-h-screen flex-col"
        style={{ background: "var(--color-gray-50)" }}
      >
        <AppHeader />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
            style={{
              borderColor: "var(--color-sophos-blue)",
              borderTopColor: "transparent",
            }}
          />
          <p className="text-sm" style={{ color: "var(--color-gray-500)" }}>
            Loading conversation…
          </p>
        </div>
      </div>
    );
  }

  if (hasMailboxContext && isUnauthorized) {
    return (
      <div
        className="flex min-h-screen flex-col"
        style={{ background: "var(--color-gray-50)" }}
      >
        <AppHeader />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.5C16.5 22.15 20 17.25 20 12V6L12 2z"
              stroke="var(--color-gray-300)"
              strokeWidth="1.5"
              fill="none"
            />
            <path
              d="M12 8v4M12 14h.01"
              stroke="var(--color-gray-400)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <p
            className="text-sm font-medium"
            style={{ color: "var(--color-gray-700)" }}
          >
            Sign in to analyze this thread
          </p>
          <p className="text-xs" style={{ color: "var(--color-gray-450)" }}>
            DealTrace needs access to your mailbox to read the full
            conversation.
          </p>
          <button
            type="button"
            onClick={handleSignIn}
            className="rounded-md px-4 py-2 text-sm font-medium text-white"
            style={{ background: "var(--color-sophos-blue)" }}
          >
            Sign in with Microsoft
          </button>
        </div>
      </div>
    );
  }

  // ── STATE A: no active deal context — show static playbook ─────────────────
  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ background: "var(--color-gray-50)" }}
    >
      <AppHeader />
      {showSampleDevHint && <DevMailboxHint />}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        <div>
          <h2
            className="text-base font-semibold"
            style={{ color: "var(--color-gray-900)" }}
          >
            All Deal Threads
          </h2>
          <p
            className="mt-0.5 text-xs"
            style={{ color: "var(--color-gray-450)" }}
          >
            Based on {patternStats.won} won and {patternStats.lost} lost deals
          </p>
        </div>
        <button
          type="button"
          className="w-full rounded-md py-2.5 text-sm font-medium text-white"
          style={{ background: "var(--color-sophos-blue)" }}
        >
          Download Rep Playbook
        </button>
        <ThreadList threads={cachedThreads} healthMap={cachedHealthMap} />
      </div>
    </div>
  );
}
