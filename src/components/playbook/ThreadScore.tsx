"use client";

import { useState } from "react";
import { Content, Header, Item, Root, Trigger } from "@radix-ui/react-accordion";
import type { ThreadHealth } from "@/lib/queries/useScore";

const CIRC = 2 * Math.PI * 75; // ≈ 471.24
const HALF = CIRC / 2; // ≈ 235.62

const PREDICTION_LABELS: Record<ThreadHealth["prediction"], string> = {
  on_track: "Very Good",
  at_risk: "At Risk",
  critical: "Critical",
};

function gaugeColor(prediction: ThreadHealth["prediction"]): string {
  if (prediction === "on_track") return "var(--color-green-400)";
  if (prediction === "at_risk") return "var(--color-orange-400)";
  return "var(--color-orange-500)";
}

function HalfCircleGauge({
  score,
  prediction,
}: {
  score: number;
  prediction: ThreadHealth["prediction"];
}) {
  const filled = HALF * (score / 100);
  const color = gaugeColor(prediction);
  const label = PREDICTION_LABELS[prediction];

  return (
    <div className="flex flex-col items-center">
      {/* viewBox height 108 clips the bottom half (circle bottom reaches y=175, outside view) */}
      <svg
        viewBox="0 0 200 108"
        width="160"
        height="86"
        role="img"
        aria-label={`Deal health score: ${score}%, ${label}`}
      >
        {/* Background half-arc */}
        <circle
          cx="100"
          cy="100"
          r="75"
          fill="none"
          stroke="var(--color-gray-200)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${HALF} ${CIRC}`}
          transform="rotate(180 100 100)"
        />
        {/* Score fill arc */}
        <circle
          cx="100"
          cy="100"
          r="75"
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${CIRC}`}
          transform="rotate(180 100 100)"
        />
        {/* Score label */}
        <text
          x="100"
          y="88"
          textAnchor="middle"
          fill="var(--color-gray-900)"
          fontSize="24"
          fontWeight="700"
        >
          {score}%
        </text>
        <text
          x="100"
          y="104"
          textAnchor="middle"
          fill={color}
          fontSize="11"
          fontWeight="500"
        >
          {label}
        </text>
      </svg>
    </div>
  );
}

interface Props {
  health: ThreadHealth | undefined;
  isLoading: boolean;
  onRequestDraft: () => void;
  isDraftLoading: boolean;
  projectedScore?: number;
  isProjecting?: boolean;
}

export default function ThreadScore({
  health,
  isLoading,
  onRequestDraft,
  isDraftLoading,
  projectedScore,
  isProjecting,
}: Props) {
  const [draftCopied, setDraftCopied] = useState(false);

  const handleCopy = async () => {
    if (!health?.draftEmail) return;
    await navigator.clipboard.writeText(health.draftEmail);
    setDraftCopied(true);
    setTimeout(() => setDraftCopied(false), 2000);
  };

  return (
    <section aria-label="Deal Health Score">
    <Root
      type="single"
      collapsible
      defaultValue="health"
      className="overflow-hidden rounded-lg border bg-white"
      style={{
        borderColor: "var(--color-gray-200)",
        boxShadow: "var(--shadow-card-light)",
      }}
    >
      <Item value="health">
        <Header className="m-0">
          <Trigger
            className="flex w-full items-center justify-between px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--color-sophos-blue) [&[data-state=open]_svg]:rotate-180"
            aria-controls="health-score-panel"
          >
            <span
              className="text-sm font-semibold"
              style={{ color: "var(--color-purple-300)" }}
            >
              Deal Health Score
            </span>
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
          </Trigger>
        </Header>

        <Content
          id="health-score-panel"
          className="border-t px-4 pb-4"
          style={{ borderColor: "var(--color-gray-150)" }}
        >
          {/* Loading skeleton */}
          {isLoading && !health ? (
            <div className="flex flex-col items-center gap-2 py-6 animate-pulse" aria-busy="true">
              <div
                className="h-20 w-40 rounded-lg"
                style={{ background: "var(--color-gray-100)" }}
              />
              <div
                className="h-3 w-full rounded"
                style={{ background: "var(--color-gray-100)" }}
              />
              <div
                className="h-3 w-3/4 rounded"
                style={{ background: "var(--color-gray-100)" }}
              />
            </div>
          ) : !health ? (
            <p
              className="py-6 text-center text-xs"
              style={{ color: "var(--color-gray-450)" }}
            >
              No health data available.
            </p>
          ) : (
            <>
              {/* Gauge */}
              <div className="flex justify-center py-3">
                <HalfCircleGauge
                  score={health.healthScore}
                  prediction={health.prediction}
                />
              </div>

              {/* Win / Risk factors */}
              <div className="mb-3 grid grid-cols-2 gap-3">
                <div>
                  <p
                    className="mb-1.5 text-xs font-semibold"
                    style={{ color: "var(--color-green-400)" }}
                  >
                    Win Factors
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
                    Risk Factor
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

              {/* Recommendations */}
              <div className="mb-3">
                <p
                  className="mb-1.5 text-xs font-semibold"
                  style={{ color: "var(--color-gray-700)" }}
                >
                  Recommendations
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

              {/* Draft email */}
              {health.draftEmail ? (
                <div
                  className="rounded-md p-3"
                  style={{ background: "var(--color-gray-100)" }}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <p
                      className="text-xs font-semibold"
                      style={{ color: "var(--color-gray-700)" }}
                    >
                      Draft Email
                    </p>
                    <button
                      onClick={handleCopy}
                      className="text-xs focus-visible:outline-none"
                      style={{
                        color: draftCopied
                          ? "var(--color-green-400)"
                          : "var(--color-gray-450)",
                      }}
                    >
                      {draftCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p
                    className="whitespace-pre-wrap text-xs"
                    style={{ color: "var(--color-gray-600)" }}
                  >
                    {health.draftEmail}
                  </p>
                  {isProjecting ? (
                    <p
                      className="mt-2 text-xs animate-pulse"
                      style={{ color: "var(--color-gray-450)" }}
                    >
                      Calculating projected score…
                    </p>
                  ) : typeof projectedScore === "number" ? (
                    <p
                      className="mt-2 text-xs font-medium"
                      style={{ color: "var(--color-sophos-blue)" }}
                    >
                      estimated adjusted score : {projectedScore}%
                    </p>
                  ) : null}
                </div>
              ) : (
                <button
                  onClick={onRequestDraft}
                  disabled={isDraftLoading}
                  className="w-full rounded-md border py-2 text-sm font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-sophos-blue)"
                  style={{
                    borderColor: "var(--color-sophos-blue)",
                    color: "var(--color-sophos-blue)",
                    background: "white",
                  }}
                >
                  {isDraftLoading ? "Generating…" : "Generate Draft Email"}
                </button>
              )}
            </>
          )}
        </Content>
      </Item>
    </Root>
    </section>
  );
}
