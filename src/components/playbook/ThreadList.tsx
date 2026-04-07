"use client";

import { useState } from "react";
import { Content, Root, Trigger } from "@radix-ui/react-collapsible";
import type { EmailThread, EmailMessage } from "@/lib/types/thread";
import type { ThreadHealth } from "@/lib/queries/useScore";
import TagBadge from "./TagBadge";

const CIRC = 2 * Math.PI * 75;
const HALF = CIRC / 2;

const PREDICTION_LABELS: Record<ThreadHealth["prediction"], string> = {
  on_track: "Very Good",
  at_risk: "At Risk",
  critical: "Critical",
};

function ScoreBadge({ health }: { health: ThreadHealth }) {
  const color =
    health.prediction === "on_track"
      ? "var(--color-green-400)"
      : health.prediction === "at_risk"
        ? "var(--color-orange-400)"
        : "var(--color-orange-500)";

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span className="text-xs font-medium" style={{ color }}>
        Score: {health.healthScore}%
      </span>
      <div
        className="h-1.5 w-12 overflow-hidden rounded-full"
        style={{ background: "var(--color-gray-200)" }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${health.healthScore}%`, background: color }}
        />
      </div>
    </div>
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
        <p className="text-xs font-medium flex flex-col">
          <span style={{ color: "var(--color-gray-800)" }}>
            {message.from.emailAddress.name}
          </span>
          <span
            className="font-normal"
            style={{ color: "var(--color-gray-500)" }}
          >
            &lt;{message.from.emailAddress.address}&gt;
          </span>
        </p>
        <p
          className="shrink-0 text-right text-xs"
          style={{ color: "var(--color-gray-450)" }}
        >
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

function RainbowGauge({
  score,
  prediction,
  gradientId,
}: {
  score: number;
  prediction: ThreadHealth["prediction"];
  gradientId: string;
}) {
  const filled = HALF * (score / 100);
  const label = PREDICTION_LABELS[prediction];

  return (
    <div className="flex justify-center">
      <svg
        viewBox="0 0 200 112"
        width="160"
        height="90"
        aria-label={`${score}%, ${label}`}
      >
        <defs>
          <linearGradient
            id={gradientId}
            x1="175"
            y1="0"
            x2="25"
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="20%" stopColor="#f97316" />
            <stop offset="40%" stopColor="#facc15" />
            <stop offset="60%" stopColor="#3b82f6" />
            <stop offset="80%" stopColor="#14b8a6" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
        </defs>
        {/* Gray background arc */}
        <circle
          cx="100"
          cy="100"
          r="75"
          fill="none"
          stroke="var(--color-gray-200)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${HALF} ${CIRC}`}
          transform="rotate(180 100 100)"
        />
        {/* Rainbow fill arc — clipped to score */}
        <circle
          cx="100"
          cy="100"
          r="75"
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${CIRC}`}
          transform="rotate(180 100 100)"
        />
        {/* Labels */}
        <text
          x="100"
          y="88"
          textAnchor="middle"
          fill="var(--color-gray-900)"
          fontSize="22"
          fontWeight="700"
        >
          {score}%
        </text>
        <text
          x="100"
          y="104"
          textAnchor="middle"
          fill="var(--color-gray-500)"
          fontSize="11"
        >
          {label}
        </text>
      </svg>
    </div>
  );
}

function DealAnalysisSummary({
  health,
  gradientId,
}: {
  health: ThreadHealth;
  gradientId: string;
}) {
  const isWon = health.outcome === "won";
  const outcomeLabel = isWon
    ? "Won"
    : health.outcome === "lost"
      ? "Lost"
      : "Concluded";
  const outcomeColor = isWon
    ? "var(--color-green-400)"
    : "var(--color-orange-500)";

  return (
    <div
      className="mt-2 border-t pt-3"
      style={{ borderColor: "var(--color-gray-200)" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <p
          className="text-sm font-semibold"
          style={{ color: "var(--color-gray-900)" }}
        >
          Case Study
        </p>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-semibold"
          style={{
            background: isWon
              ? "var(--color-green-50)"
              : "var(--color-orange-50)",
            color: outcomeColor,
          }}
        >
          {outcomeLabel}
        </span>
      </div>

      <RainbowGauge
        score={health.healthScore}
        prediction={health.prediction}
        gradientId={gradientId}
      />

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <p
            className="mb-1.5 text-xs font-semibold"
            style={{ color: "var(--color-green-400)" }}
          >
            What Helped
          </p>
          <ul className="space-y-1">
            {health.winFactors.map((f, i) => (
              <li
                key={i}
                className="flex gap-1.5 text-xs"
                style={{ color: "var(--color-gray-700)" }}
              >
                <span
                  className="mt-0.5 shrink-0"
                  style={{ color: "var(--color-green-400)" }}
                >
                  ✓
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p
            className="mb-1.5 text-xs font-semibold"
            style={{ color: "var(--color-orange-500)" }}
          >
            What Hurt
          </p>
          <ul className="space-y-1">
            {health.riskFactors.map((f, i) => (
              <li
                key={i}
                className="flex gap-1.5 text-xs"
                style={{ color: "var(--color-gray-700)" }}
              >
                <span
                  className="mt-0.5 shrink-0"
                  style={{ color: "var(--color-orange-400)" }}
                >
                  ✕
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <p
          className="mb-1.5 text-xs font-semibold"
          style={{ color: "var(--color-gray-700)" }}
        >
          Lessons Learned
        </p>
        <ol className="space-y-1">
          {health.recommendations.map((r, i) => (
            <li
              key={i}
              className="flex gap-1.5 text-xs"
              style={{ color: "var(--color-gray-700)" }}
            >
              <span
                className="shrink-0 font-medium"
                style={{ color: "var(--color-gray-450)" }}
              >
                {i + 1}.
              </span>
              {r}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

interface ThreadCardProps {
  thread: EmailThread;
  health?: ThreadHealth;
  isLoading?: boolean;
  isSelected?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
  // State A: expand accordion + auto-analyze on first open
  onExpand?: (thread: EmailThread) => void;
  // State B list: click navigates to that thread, no expansion
  onSelect?: (thread: EmailThread) => void;
}

function CardHeader({
  thread,
  health,
}: {
  thread: EmailThread;
  health?: ThreadHealth;
}) {
  const prospectName =
    thread.mainContact ??
    thread.messages.find(
      (m) => !m.from.emailAddress.address.includes("sophos.com"),
    )?.from.emailAddress.name;

  const prospectEmail = thread.messages.find(
    (m) => !m.from.emailAddress.address.includes("sophos.com"),
  )?.from.emailAddress.address;

  return (
    <>
      <div className="mb-1 flex items-start justify-between gap-2">
        <h3
          className="flex-1 truncate text-sm font-semibold"
          style={{ color: "var(--color-gray-900)" }}
        >
          {thread.subject}
        </h3>
      </div>
      {prospectName && (
        <p
          className="mb-0.5 truncate text-xs flex flex-col"
          style={{ color: "var(--color-gray-500)" }}
        >
          {prospectName}
          {prospectEmail && (
            <span className="opacity-70">&lt;{prospectEmail}&gt;</span>
          )}
        </p>
      )}
      <p className="mb-1.5 text-xs" style={{ color: "var(--color-gray-400)" }}>
        {thread.messages.length} message
        {thread.messages.length !== 1 ? "s" : ""}
      </p>
      <div className="flex items-center justify-between">
        {thread.product && (
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 font-medium"
            style={{
              fontSize: "10px",
              background: "var(--color-primary)",
              color: "var(--color-sophos-blue)",
            }}
          >
            {thread.product}
          </span>
        )}
        {health && <ScoreBadge health={health} />}
      </div>
    </>
  );
}

function ThreadCard({
  thread,
  health,
  isLoading,
  isSelected,
  isOpen: open = false,
  onToggle,
  onExpand,
  onSelect,
}: ThreadCardProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const previewText = thread.messages[0]?.bodyPreview;
  const gradientId = `rainbow-${thread.conversationId}`;

  const handleDownloadCaseStudy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDownloading(true);
    try {
      const res = await fetch(`/api/casestudy?id=${encodeURIComponent(thread.conversationId)}`);
      if (!res.ok) throw new Error("Case study generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "CaseStudy.pptx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  };

  const cardBorder = isSelected
    ? "var(--color-sophos-blue)"
    : "var(--color-gray-200)";

  // ── State B list mode: click = navigate, no expansion ──────────────────────
  if (onSelect) {
    return (
      <article
        className="overflow-hidden rounded-lg border bg-white"
        style={{
          borderColor: cardBorder,
          boxShadow: "var(--shadow-card-light)",
          ...(isSelected
            ? { boxShadow: "0 0 0 1px var(--color-sophos-blue)" }
            : {}),
        }}
      >
        <button
          type="button"
          className="w-full p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--color-sophos-blue)"
          onClick={() => onSelect(thread)}
          aria-current={isSelected ? "true" : undefined}
        >
          <CardHeader thread={thread} health={health} />
          {previewText && (
            <p
              className="mt-1.5 overflow-hidden text-xs leading-4"
              style={{
                color: "var(--color-gray-600)",
                maxHeight: "2rem",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical" as const,
                textOverflow: "ellipsis",
              }}
            >
              {previewText}
            </p>
          )}
        </button>
      </article>
    );
  }

  // ── State A: Radix Collapsible — expand = analyze + score ─────────────────
  return (
    <article
      className="overflow-hidden rounded-lg border bg-white"
      style={{
        borderColor: "var(--color-gray-200)",
        boxShadow: "var(--shadow-card-light)",
      }}
    >
      <Root
        open={open}
        onOpenChange={(next) => {
          onToggle?.();
          if (next) onExpand?.(thread);
        }}
      >
        <Trigger
          type="button"
          className="flex w-full items-start gap-2 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--color-sophos-blue) [&[data-state=open]_svg]:rotate-180"
          aria-expanded={open}
        >
          <div className="min-w-0 flex-1">
            <CardHeader thread={thread} health={health} />
          </div>
          <svg
            className="mt-0.5 h-4 w-4 shrink-0 transition-transform"
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
        </Trigger>

        {!open && previewText && (
          <p
            className="overflow-hidden px-3 pb-2 text-xs leading-4"
            style={{
              color: "var(--color-gray-600)",
              maxHeight: "2rem",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical" as const,
              textOverflow: "ellipsis",
            }}
          >
            {previewText}
          </p>
        )}

        <Content>
          <div
            className="border-t px-3 pb-3"
            style={{ borderColor: "var(--color-gray-150)" }}
          >
            {isLoading ? (
              <div
                className="flex flex-col gap-2 py-4 animate-pulse"
                aria-busy="true"
              >
                <div
                  className="h-3 rounded"
                  style={{ background: "var(--color-gray-100)" }}
                />
                <div
                  className="h-3 w-4/5 rounded"
                  style={{ background: "var(--color-gray-100)" }}
                />
                <div
                  className="h-3 w-3/5 rounded"
                  style={{ background: "var(--color-gray-100)" }}
                />
              </div>
            ) : (
              <>
                {thread.messages.map((message) => (
                  <MessageRow key={message.id} message={message} />
                ))}
                {health && (
                  <DealAnalysisSummary
                    health={health}
                    gradientId={gradientId}
                  />
                )}
              </>
            )}
            <button
              type="button"
              className="mt-3 w-full rounded-md border py-1.5 text-xs font-medium disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-sophos-blue)"
              style={{
                borderColor: "var(--color-sophos-blue)",
                color: "var(--color-sophos-blue)",
              }}
              disabled={isDownloading}
              onClick={handleDownloadCaseStudy}
            >
              {isDownloading ? "Generating\u2026" : "Download Case Study"}
            </button>
          </div>
        </Content>

        {!open && (
          <div className="px-3 pb-3">
            <button
              type="button"
              className="w-full rounded-md border py-1.5 text-xs font-medium disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-sophos-blue)"
              style={{
                borderColor: "var(--color-sophos-blue)",
                color: "var(--color-sophos-blue)",
              }}
              disabled={isDownloading}
              onClick={handleDownloadCaseStudy}
            >
              {isDownloading ? "Generating\u2026" : "Download Case Study"}
            </button>
          </div>
        )}
      </Root>
    </article>
  );
}

interface ThreadListProps {
  threads: EmailThread[];
  healthMap?: Record<string, ThreadHealth>;
  loadingId?: string | null;
  selectedConversationId?: string | null;
  onExpand?: (thread: EmailThread) => void;
  onSelect?: (thread: EmailThread) => void;
}

export default function ThreadList({
  threads,
  healthMap = {},
  loadingId,
  selectedConversationId,
  onExpand,
  onSelect,
}: ThreadListProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (threads.length === 0) {
    return (
      <p
        className="py-8 text-center text-sm"
        style={{ color: "var(--color-gray-400)" }}
      >
        No threads found.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2" role="list">
      {threads.map((thread) => (
        <li key={thread.conversationId}>
          <ThreadCard
            thread={thread}
            health={healthMap[thread.conversationId]}
            isLoading={loadingId === thread.conversationId}
            isSelected={
              onSelect != null &&
              selectedConversationId === thread.conversationId
            }
            isOpen={openId === thread.conversationId}
            onToggle={() =>
              setOpenId((prev) =>
                prev === thread.conversationId ? null : thread.conversationId,
              )
            }
            onExpand={onExpand}
            onSelect={onSelect}
          />
        </li>
      ))}
    </ul>
  );
}
