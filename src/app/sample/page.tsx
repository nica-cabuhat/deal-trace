"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Content, Root, Trigger } from "@radix-ui/react-collapsible";
import rawMessages from "@/lib/data/threads.json";
import type { EmailMessage, EmailThread } from "@/lib/types/thread";
import { groupIntoThreads } from "@/lib/graph/groupThreads";
import { useMailboxConversation } from "@/lib/outlook/useMailboxConversation";
import { useAnalyze } from "@/lib/queries/useAnalyze";
import { useScore, type ThreadHealth } from "@/lib/queries/useScore";
import { useOutlookThread } from "@/lib/outlook/useOutlookThread";
import ThreadList from "@/components/playbook/ThreadList";
import ThreadScore from "@/components/playbook/ThreadScore";
import TagBadge from "@/components/playbook/TagBadge";

const baseThreads = groupIntoThreads(rawMessages as unknown as EmailMessage[]);

function DevMailboxHint() {
  return (
    <p
      role="note"
      className="px-4 pt-2 text-center text-xs leading-snug"
      style={{ color: "var(--color-gray-450)" }}
    >
      The Outlook add-in loads <code className="font-mono">/taskpane</code> with Office.js. On
      this page use query params to simulate a message, e.g.{" "}
      <code className="font-mono">?subject=Your+Subject</code> or{" "}
      <code className="font-mono">?conv=…</code>.
    </p>
  );
}

function AppHeader() {
  return (
    <header
      className="flex items-center gap-2 border-b px-4 py-3"
      style={{ borderColor: "var(--color-gray-200)", background: "white" }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
      <span className="text-sm font-bold" style={{ color: "var(--color-sophos-blue)" }}>
        DealTrace
      </span>
    </header>
  );
}

function MessageRow({ message }: { message: EmailMessage }) {
  const date = new Date(message.receivedDateTime).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div
      className="border-t py-2.5 first:border-t-0"
      style={{ borderColor: "var(--color-gray-150)" }}
    >
      <div className="mb-0.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium" style={{ color: "var(--color-gray-800)" }}>
          {message.from.emailAddress.name}
          <span className="ml-1 font-normal" style={{ color: "var(--color-gray-500)" }}>
            &lt;{message.from.emailAddress.address}&gt;
          </span>
        </span>
        <span className="shrink-0 text-xs" style={{ color: "var(--color-gray-450)" }}>
          {date}
        </span>
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
  const [open, setOpen] = useState(true);

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
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          {thread.messages[0] && (
            <p className="mb-1.5 text-xs" style={{ color: "var(--color-gray-500)" }}>
              {thread.messages[0].from.emailAddress.name}
              <span className="ml-1 opacity-70">
                &lt;{thread.messages[0].from.emailAddress.address}&gt;
              </span>
              <span className="ml-1 opacity-50">
                · {thread.messages.length} message
                {thread.messages.length !== 1 ? "s" : ""}
              </span>
            </p>
          )}
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
  const [urlMailboxSubject, setUrlMailboxSubject] = useState<string | null>(null);

  // ── State A: static threads for playbook list ──────────────────────────────
  const [threads, setThreads] = useState<EmailThread[]>(baseThreads);
  const [healthMap, setHealthMap] = useState<Record<string, ThreadHealth>>({});
  const analyzedIds = useRef<Set<string>>(new Set());
  const scoredIds = useRef<Set<string>>(new Set());
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  // ── State B: live thread from real Outlook conversation ────────────────────
  const [liveThread, setLiveThread] = useState<EmailThread | null>(null);
  const [liveHealth, setLiveHealth] = useState<ThreadHealth | null>(null);
  const [isLiveAnalyzing, setIsLiveAnalyzing] = useState(false);
  const [isLiveScoring, setIsLiveScoring] = useState(false);
  const [liveDraftingId, setLiveDraftingId] = useState<string | null>(null);
  const [liveProjectedScore, setLiveProjectedScore] = useState<number | undefined>();
  const [isLiveProjecting, setIsLiveProjecting] = useState(false);
  const [isAllThreadsOpen, setIsAllThreadsOpen] = useState(false);
  const lastLiveConvId = useRef<string | null>(null);

  const { mutateAsync: analyze } = useAnalyze();
  const { mutateAsync: scoreThread } = useScore();

  useEffect(() => {
    const path = window.location.pathname;
    setShowSampleDevHint(path === "/sample" || path.endsWith("/sample"));
  }, []);

  const {
    conversationId: officeConversationId,
    itemSubject: officeSubject,
    isOfficeReady,
  } = useMailboxConversation({
    onConversationChanged: () => {
      setLiveThread(null);
      setLiveHealth(null);
      lastLiveConvId.current = null;
    },
  });

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setUrlMailboxConversationId(p.get("conv") ?? p.get("mailboxConversation"));
    setUrlMailboxSubject(p.get("subject"));
  }, []);

  const mailboxConversationId = officeConversationId ?? urlMailboxConversationId;
  const mailboxSubject = officeSubject ?? urlMailboxSubject;
  const hasMailboxContext = !!(mailboxConversationId || mailboxSubject);

  // Fetch the REAL conversation from Outlook using Office.js callback token
  const {
    data: conversationResult,
    isLoading: isLoadingConversation,
  } = useOutlookThread(mailboxConversationId, isOfficeReady);

  const fetchedThread = conversationResult?.thread ?? null;
  const isOfficeUnavailable = conversationResult?.isOfficeUnavailable ?? false;

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

  // ── State A: expand / analyze static threads ───────────────────────────────
  const doScore = useCallback(
    async (thread: EmailThread) => {
      const health = await scoreThread({ thread });
      setHealthMap((prev) => ({ ...prev, [thread.conversationId]: health }));
    },
    [scoreThread],
  );

  const ensureThreadAnalyzed = useCallback(
    async (thread: EmailThread) => {
      const cid = thread.conversationId;
      if (analyzedIds.current.has(cid) && scoredIds.current.has(cid)) return;

      if (!analyzedIds.current.has(cid)) {
        analyzedIds.current.add(cid);
        setAnalyzingId(cid);
        try {
          const result = await analyze(thread.messages);
          const analyzedThread: EmailThread = {
            ...thread,
            messages: result.messages,
            threadTags: result.threadTags,
            product: result.product ?? thread.product,
            mainContact: result.mainContact ?? thread.mainContact,
          };
          setThreads((prev) =>
            prev.map((t) => (t.conversationId === cid ? analyzedThread : t)),
          );
          scoredIds.current.add(cid);
          await doScore(analyzedThread);
        } catch {
          analyzedIds.current.delete(cid);
        } finally {
          setAnalyzingId(null);
        }
      } else if (!scoredIds.current.has(cid)) {
        scoredIds.current.add(cid);
        await doScore(thread);
      }
    },
    [analyze, doScore],
  );

  const handleExpand = useCallback(
    (thread: EmailThread) => {
      void ensureThreadAnalyzed(thread);
    },
    [ensureThreadAnalyzed],
  );

  const handleLiveDraft = useCallback(
    async (thread: EmailThread) => {
      setLiveDraftingId(thread.conversationId);
      try {
        const health = await scoreThread({ thread, includeDraft: true });
        setLiveHealth(health);
      } finally {
        setLiveDraftingId(null);
      }

      setIsLiveProjecting(true);
      try {
        const projected = await scoreThread({ thread });
        setLiveProjectedScore(projected.healthScore);
      } finally {
        setIsLiveProjecting(false);
      }
    },
    [scoreThread],
  );

  // ── STATE B: real Outlook conversation selected ────────────────────────────
  if (hasMailboxContext) {
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
              style={{ borderColor: "var(--color-sophos-blue)", borderTopColor: "transparent" }}
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

    if (isOfficeUnavailable) {
      return (
        <div
          className="flex min-h-screen flex-col"
          style={{ background: "var(--color-gray-50)" }}
        >
          <AppHeader />
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.5C16.5 22.15 20 17.25 20 12V6L12 2z"
                stroke="var(--color-gray-300)"
                strokeWidth="1.5"
                fill="none"
              />
              <path d="M12 8v4M12 14h.01" stroke="var(--color-gray-400)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <p className="text-sm font-medium" style={{ color: "var(--color-gray-700)" }}>
              Office context not available
            </p>
            <p className="text-xs" style={{ color: "var(--color-gray-450)" }}>
              Open DealTrace from the Outlook taskpane to analyze the selected email thread.
              On the <code className="font-mono">/sample</code> page, use{" "}
              <code className="font-mono">?conv=…</code> to simulate.
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
            <h2 className="text-sm font-semibold" style={{ color: "var(--color-gray-600)" }}>
              Selected Deal Thread
            </h2>

            <SelectedThreadCard thread={t} />

            <ThreadScore
              health={liveHealth ?? undefined}
              isLoading={isLiveScoring}
              onRequestDraft={() => void handleLiveDraft(t)}
              isDraftLoading={liveDraftingId === t.conversationId}
              projectedScore={liveProjectedScore}
              isProjecting={isLiveProjecting}
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
                {isAllThreadsOpen ? "Hide Deal Threads" : "Show All Deal Threads"}
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
                    threads={threads}
                    healthMap={healthMap}
                  />
                </div>
              )}
            </section>
          </div>
        </div>
      );
    }

    return (
      <div
        className="flex min-h-screen flex-col"
        style={{ background: "var(--color-gray-50)" }}
      >
        <AppHeader />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm" style={{ color: "var(--color-gray-500)" }}>
            No conversation data found for the selected email.
          </p>
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
        <h2
          className="text-base font-semibold"
          style={{ color: "var(--color-gray-900)" }}
        >
          All Deal Threads
        </h2>
        <button
          type="button"
          className="w-full rounded-md py-2.5 text-sm font-medium text-white"
          style={{ background: "var(--color-sophos-blue)" }}
        >
          Download Rep Playbook
        </button>
        <ThreadList
          threads={threads}
          healthMap={healthMap}
          loadingId={analyzingId}
          onExpand={handleExpand}
        />
      </div>
    </div>
  );
}
