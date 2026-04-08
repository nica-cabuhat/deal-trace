"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";

function PlayIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="32" fill="rgba(0,0,0,0.45)" />
      <path d="M26 20L46 32L26 44V20Z" fill="white" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="20" fill="rgba(0,0,0,0.45)" />
      <rect x="14" y="12" width="4" height="16" rx="1" fill="white" />
      <rect x="22" y="12" width="4" height="16" rx="1" fill="white" />
    </svg>
  );
}

// ── Scrollytelling showcase data ─────────────────────────────────────────────

const SHOWCASE = [
  {
    id: "analysis",
    badge: "AI Engine",
    title: "Real-time signal detection on every message",
    desc: "DealTrace reads each email in the thread and tags it with engagement signals, urgency cues, and sentiment shifts. Positive, negative, and neutral — every signal is surfaced so you never fly blind.",
    detail: "Powered by Groq LLM inference with sub-5-second response times.",
  },
  {
    id: "scoring",
    badge: "Deal Health",
    title: "A live health score for every active deal",
    desc: "Get a 0–100 score that tells you exactly where each deal stands. On track, at risk, or critical — DealTrace evaluates win factors, risk signals, and engagement patterns to give you a single source of truth.",
    detail: "Scores update with every new message in the thread.",
  },
  {
    id: "reports",
    badge: "Reports",
    title: "One-click branded playbooks and case studies",
    desc: "Generate presentation-ready PPTX files directly from your deal data. Won deals become replication playbooks. Lost deals become post-mortems. Every report uses your Sophos branding and is ready to share with leadership.",
    detail:
      "Template-based generation preserves brand guidelines automatically.",
  },
  {
    id: "outlook",
    badge: "Integration",
    title: "Lives where you already work — inside Outlook",
    desc: "No new tabs, no context switching. DealTrace runs as a native Outlook add-in sidebar. Open any email thread and get instant analysis without leaving your inbox.",
    detail: "Works with Outlook desktop, web, and mobile.",
  },
];

// ── Screenshot images for each showcase ──────────────────────────────────────

const SHOWCASE_IMAGES: Record<string, { src: string; alt: string }> = {
  analysis: {
    src: "/screenshot/screenshot-8.png",
    alt: "Email thread with AI-detected engagement signals and tags",
  },
  scoring: {
    src: "/screenshot/screenshot-9.png",
    alt: "DealTrace sidebar showing 92% health score with win and risk factors",
  },
  reports: {
    src: "/screenshot/screenshot-10.png",
    alt: "Generated Rep Playbook PPTX with Sophos branding in PowerPoint",
  },
  outlook: {
    src: "/screenshot/screenshot-11.png",
    alt: "DealTrace running as a native Outlook add-in sidebar",
  },
};

const STEPS = [
  {
    num: "01",
    title: "Open any email thread",
    desc: "DealTrace detects deal-related conversations automatically and surfaces them in the sidebar.",
  },
  {
    num: "02",
    title: "Get instant analysis",
    desc: "AI scores the thread, tags each message with engagement signals, and calculates a live health score.",
  },
  {
    num: "03",
    title: "Act on insights",
    desc: "Download branded case studies, review win/loss patterns, and apply proven playbooks to your next deal.",
  },
];

const STATS = [
  { value: "< 5s", label: "Analysis time per thread" },
  { value: "100%", label: "Branded PPTX output" },
  { value: "6", label: "Signal categories tracked" },
  { value: "0", label: "Context switches needed" },
];

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeShowcase, setActiveShowcase] = useState(SHOWCASE[0].id);
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const setRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) sectionRefs.current.set(id, el);
      else sectionRefs.current.delete(id);
    },
    [],
  );

  useEffect(() => {
    const els = Array.from(sectionRefs.current.entries());
    if (!els.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute("data-showcase");
            if (id) setActiveShowcase(id);
          }
        }
      },
      { rootMargin: "-40% 0px -40% 0px", threshold: 0 },
    );

    for (const [, el] of els) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  const activeImage = SHOWCASE_IMAGES[activeShowcase];

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--color-gray-50)" }}
    >
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-50 border-b backdrop-blur-md"
        style={{
          borderColor: "var(--color-gray-150)",
          background: "rgba(255,255,255,0.85)",
        }}
      >
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center justify-between gap-2">
            <img
              src="/icon-32.png"
              alt="DealTrace"
              className="h-6 w-6 rounded"
            />
            <span
              className="text-lg font-bold tracking-tight"
              style={{ color: "var(--color-gray-900)" }}
            >
              DealTrace
            </span>
          </div>

          <div className="hidden items-center gap-8 md:flex">
            <a
              href="#features"
              className="text-sm font-medium transition-colors hover:opacity-80"
              style={{ color: "var(--color-gray-550)" }}
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="text-sm font-medium transition-colors hover:opacity-80"
              style={{ color: "var(--color-gray-550)" }}
            >
              How It Works
            </a>
            <a
              href="#demo"
              className="text-sm font-medium transition-colors hover:opacity-80"
              style={{ color: "var(--color-gray-550)" }}
            >
              Demo
            </a>
          </div>

          <Link
            href="/sample"
            className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--color-sophos-blue)" }}
          >
            Launch App
          </Link>
        </nav>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pb-8 pt-20 md:pb-16 md:pt-32">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-3xl text-center">
            <h1
              className="mb-6 text-4xl font-extrabold leading-tight tracking-tight md:text-6xl md:leading-[1.1]"
              style={{ color: "var(--color-gray-900)" }}
            >
              Every win creates a pattern, <br />
              <span style={{ color: "var(--color-sophos-blue)" }}>
                Every loss leaves a clue
              </span>
            </h1>

            <p
              className="mx-auto mb-10 max-w-xl text-lg leading-relaxed"
              style={{ color: "var(--color-gray-600)" }}
            >
              DealTrace lives inside Outlook and uses AI to score your deal
              threads, detect risk signals, and generate rep playbook. Close
              more. Lose less.
            </p>
          </div>

          {/* Video */}
          <div id="demo" className="mx-auto mt-16 max-w-5xl md:mt-20">
            <div
              className="relative overflow-hidden rounded-2xl border shadow-2xl"
              style={{ borderColor: "var(--color-gray-200)" }}
            >
              <video
                ref={videoRef}
                className="block w-full"
                src="/demo.mp4"
                playsInline
                preload="metadata"
                onEnded={() => setIsPlaying(false)}
                onClick={togglePlay}
                aria-label="DealTrace product demo"
              />

              {/* Play / Pause overlay */}
              <button
                type="button"
                onClick={togglePlay}
                className="absolute inset-0 flex items-center justify-center transition-opacity focus-visible:outline-none"
                style={{ opacity: isPlaying ? 0 : 1 }}
                onMouseEnter={(e) => {
                  if (isPlaying) e.currentTarget.style.opacity = "1";
                }}
                onMouseLeave={(e) => {
                  if (isPlaying) e.currentTarget.style.opacity = "0";
                }}
                aria-label={isPlaying ? "Pause video" : "Play video"}
              >
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features — scrollytelling ──────────────────────────────────── */}
      <section id="features" className="py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <p
              className="mb-3 text-sm font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-sophos-blue)" }}
            >
              Features
            </p>
            <h2
              className="mb-4 text-3xl font-extrabold tracking-tight md:text-4xl"
              style={{ color: "var(--color-gray-900)" }}
            >
              Everything you need to close smarter
            </h2>
            <p
              className="text-base leading-relaxed"
              style={{ color: "var(--color-gray-450)" }}
            >
              From signal detection to branded deliverables — DealTrace covers
              the full deal intelligence lifecycle.
            </p>
          </div>

          <div className="relative md:grid md:grid-cols-2 md:gap-16">
            {/* Left — scrolling text panels */}
            <div className="space-y-32 md:space-y-48">
              {SHOWCASE.map((item) => {
                const isActive = activeShowcase === item.id;
                return (
                  <div
                    key={item.id}
                    ref={setRef(item.id)}
                    data-showcase={item.id}
                    className="transition-opacity duration-500"
                    style={{ opacity: isActive ? 1 : 0.3 }}
                  >
                    <span
                      className="mb-3 inline-block rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider"
                      style={{
                        background: "var(--color-blue-35)",
                        color: "var(--color-sophos-blue)",
                      }}
                    >
                      {item.badge}
                    </span>
                    <h3
                      className="mb-3 text-2xl font-extrabold leading-snug md:text-3xl"
                      style={{ color: "var(--color-gray-900)" }}
                    >
                      {item.title}
                    </h3>
                    <p
                      className="mb-4 text-base leading-relaxed"
                      style={{ color: "var(--color-gray-500)" }}
                    >
                      {item.desc}
                    </p>
                    <p
                      className="text-sm font-medium"
                      style={{ color: "var(--color-gray-400)" }}
                    >
                      {item.detail}
                    </p>

                    {/* Mobile-only: show image inline */}
                    <div className="mt-8 md:hidden">
                      {SHOWCASE_IMAGES[item.id] && (
                        <Image
                          src={SHOWCASE_IMAGES[item.id].src}
                          alt={SHOWCASE_IMAGES[item.id].alt}
                          width={500}
                          height={720}
                          className="w-full rounded-xl border shadow-sm"
                          style={{ borderColor: "var(--color-gray-150)" }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right — sticky illustration */}
            <div className="hidden md:block">
              <div className="sticky top-22">
                <div
                  className="overflow-hidden rounded-2xl border shadow-lg transition-all duration-500 w-full"
                  style={{ borderColor: "var(--color-gray-150)" }}
                >
                  {activeImage && (
                    <Image
                      src={activeImage.src}
                      alt={activeImage.alt}
                      width={500}
                      height={720}
                      className="block w-full h-auto"
                      priority
                      sizes="(min-width: 500px) 40vw, 80vw"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────────────────────── */}
      <section
        id="how-it-works"
        className="border-y py-20 md:py-28"
        style={{
          borderColor: "var(--color-gray-150)",
          background: "white",
        }}
      >
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <p
              className="mb-3 text-sm font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-sophos-blue)" }}
            >
              How It Works
            </p>
            <h2
              className="mb-4 text-3xl font-extrabold tracking-tight md:text-4xl"
              style={{ color: "var(--color-gray-900)" }}
            >
              Three steps to deal intelligence
            </h2>
          </div>

          <div className="mx-auto grid max-w-4xl gap-10 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.num} className="text-center">
                <div
                  className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-extrabold text-white"
                  style={{ background: "var(--color-sophos-blue)" }}
                >
                  {s.num}
                </div>
                <h3
                  className="mb-2 text-base font-bold"
                  style={{ color: "var(--color-gray-900)" }}
                >
                  {s.title}
                </h3>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--color-gray-450)" }}
                >
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div
            className="relative overflow-hidden rounded-3xl px-8 py-16 text-center md:px-16 md:py-24"
            style={{ background: "var(--color-blue-400)" }}
          >
            <h2 className="mb-4 text-3xl font-extrabold text-white md:text-4xl">
              Ready to turn your inbox into a deal engine?
            </h2>
            <p className="mx-auto mb-8 max-w-xl text-base leading-relaxed text-white/75">
              Stop guessing which deals will close. Let DealTrace surface the
              signals your team is missing — right inside Outlook.
            </p>
            <Link
              href="/sample"
              className="inline-flex rounded-lg px-8 py-3.5 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{
                background: "white",
                color: "var(--color-sophos-blue)",
              }}
            >
              Launch DealTrace
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer
        className="border-t py-10"
        style={{ borderColor: "var(--color-gray-150)" }}
      >
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 md:flex-row">
          <div className="flex items-center gap-2">
            <img
              src="/icon-32.png"
              alt="DealTrace"
              className="h-6 w-6 rounded"
            />
            <span
              className="text-sm font-semibold"
              style={{ color: "var(--color-gray-700)" }}
            >
              DealTrace
            </span>
          </div>
          <p className="text-xs" style={{ color: "var(--color-gray-400)" }}>
            Sophos Confidential &middot; DealTrace AI Engine &middot; Not for
            external distribution
          </p>
        </div>
      </footer>
    </div>
  );
}
