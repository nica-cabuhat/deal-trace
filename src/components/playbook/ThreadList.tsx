"use client";

import { useState } from "react";
import type { EmailThread, EmailMessage, ThreadTag } from "@/lib/types/thread";
import TagBadge from "./TagBadge";

function CloseLikelihoodBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const barColor =
    pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-amber-500" : "bg-red-400";

  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500">
      <span>Close</span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200">
        <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span>{pct}%</span>
    </div>
  );
}

function PatternBadge({ tag }: { tag: ThreadTag }) {
  const score = Math.round(tag.score * 100);
  return (
    <span
      className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 ring-1 ring-inset ring-gray-200"
      title={`Score: ${score}%`}
    >
      {tag.pattern}
    </span>
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
    <div className="border-t border-gray-100 py-2.5 first:border-t-0">
      <div className="mb-0.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-gray-800">
          {message.from.emailAddress.name}
          <span className="ml-1 font-normal opacity-50">
            &lt;{message.from.emailAddress.address}&gt;
          </span>
        </span>
        <span className="shrink-0 text-xs text-gray-400">{date}</span>
      </div>
      <p className="text-xs text-gray-600">{message.bodyPreview}</p>
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

function ThreadCard({ thread }: { thread: EmailThread }) {
  const [isOpen, setIsOpen] = useState(false);

  const latest = thread.messages[0];
  const allTags = thread.messages.flatMap((m) => m.tags ?? []);
  const closeLikelihood = thread.threadTags?.find(
    (t) => t.closeLikelihood !== undefined,
  )?.closeLikelihood;

  return (
    <article className="rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Clickable summary header */}
      <button
        className="w-full cursor-pointer p-3 text-left"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="flex-1 truncate text-sm font-semibold text-gray-900">
            {thread.subject}
          </h3>
          <div className="flex shrink-0 items-center gap-2">
            {closeLikelihood !== undefined && (
              <CloseLikelihoodBar value={closeLikelihood} />
            )}
            <svg
              className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {latest && (
          <p className="mb-1 text-xs text-gray-500">
            {latest.from.emailAddress.name}
            <span className="ml-1 opacity-60">
              &lt;{latest.from.emailAddress.address}&gt;
            </span>
            <span className="ml-1 opacity-40">
              · {thread.messages.length} message{thread.messages.length !== 1 ? "s" : ""}
            </span>
          </p>
        )}

        {(thread.product || thread.mainContact) && (
          <div className="mb-1 flex flex-wrap gap-1">
            {thread.product && (
              <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
                {thread.product}
              </span>
            )}
            {thread.mainContact && (
              <span className="inline-flex items-center rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700 ring-1 ring-inset ring-teal-200">
                {thread.mainContact}
              </span>
            )}
          </div>
        )}

        {!isOpen && latest?.bodyPreview && (
          <p className="mb-2 line-clamp-2 text-xs text-gray-600">
            {latest.bodyPreview}
          </p>
        )}

        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {allTags.map((tag, i) => (
              <TagBadge key={`${tag.signal}-${i}`} tag={tag} />
            ))}
          </div>
        )}

        {thread.threadTags && thread.threadTags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {thread.threadTags.map((tag, i) => (
              <PatternBadge key={i} tag={tag} />
            ))}
          </div>
        )}
      </button>

      {/* Expanded message list */}
      {isOpen && (
        <div className="border-t border-gray-100 px-3 pb-2">
          {thread.messages.map((message) => (
            <MessageRow key={message.id} message={message} />
          ))}
        </div>
      )}
    </article>
  );
}

export default function ThreadList({ threads }: { threads: EmailThread[] }) {
  if (threads.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-400">
        No threads found.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2" role="list">
      {threads.map((thread) => (
        <li key={thread.conversationId}>
          <ThreadCard thread={thread} />
        </li>
      ))}
    </ul>
  );
}
