"use client";

import { useState } from "react";
import rawMessages from "@/lib/data/threads.json";
import type { EmailMessage, EmailThread } from "@/lib/types/thread";
import { groupIntoThreads } from "@/lib/graph/groupThreads";
import { useAnalyze } from "@/lib/queries/useAnalyze";
import ThreadList from "@/components/playbook/ThreadList";

const baseThreads = groupIntoThreads(rawMessages as unknown as EmailMessage[]);

export default function SamplePage() {
  const [threads, setThreads] = useState<EmailThread[]>(baseThreads);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const { mutateAsync: analyze } = useAnalyze();

  const handleAnalyze = async (thread: EmailThread) => {
    setAnalyzingId(thread.conversationId);
    try {
      const result = await analyze(thread.messages);
      setThreads((prev) =>
        prev.map((t) =>
          t.conversationId === thread.conversationId
            ? {
                ...t,
                messages: result.messages,
                threadTags: result.threadTags,
                product: result.product,
                mainContact: result.mainContact,
              }
            : t,
        ),
      );
    } finally {
      setAnalyzingId(null);
    }
  };

  return (
    <main className="mx-auto max-w-lg p-4">
      <h1 className="mb-4 text-lg font-semibold">Sample Threads</h1>
      <ul className="flex flex-col gap-2" role="list">
        {threads.map((thread) => (
          <li key={thread.conversationId}>
            <div className="relative">
              <ThreadList threads={[thread]} />
              <button
                onClick={() => handleAnalyze(thread)}
                disabled={analyzingId === thread.conversationId}
                className="mt-1 w-full rounded-md border border-gray-200 py-1 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-50"
              >
                {analyzingId === thread.conversationId ? "Analyzing…" : "Analyze"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
