import type { EmailThread } from "@/lib/types/thread";

/** Consider a thread “active” if the latest message is within this window. */
const ACTIVE_DEAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function getLatestMessageDate(thread: EmailThread): Date {
  return thread.messages.reduce((latest, m) => {
    const d = new Date(m.receivedDateTime);
    return d > latest ? d : latest;
  }, new Date(0));
}

/**
 * Active deal: recent client/rep exchange (within 30 days) and not flagged as closed
 * via analysis tags (high negative close likelihood).
 */
export function isThreadActiveDeal(thread: EmailThread, nowMs: number = Date.now()): boolean {
  const latest = getLatestMessageDate(thread).getTime();
  if (nowMs - latest > ACTIVE_DEAL_WINDOW_MS) return false;

  const concludedByTags = thread.threadTags?.some(
    (t) =>
      t.direction === "negative" &&
      t.closeLikelihood != null &&
      t.closeLikelihood >= 0.9,
  );
  if (concludedByTags) return false;

  return true;
}

/** Normalize IDs so Graph vs Outlook REST string differences still match. */
function normalizeConversationKey(id: string): string {
  return id.trim().replace(/\s+/g, "").replace(/=+$/u, "").toLowerCase();
}

/** Normalize subjects for matching (Re:/Fwd:, case, spacing). */
export function normalizeMailSubject(subject: string): string {
  return subject
    .replace(/^(re|fw|fwd):\s*/giu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

export function findThreadForConversation(
  threads: EmailThread[],
  conversationId: string | null | undefined,
): EmailThread | null {
  if (!conversationId?.trim()) return null;
  const needle = conversationId.trim();
  const exact = threads.find((t) => t.conversationId === needle);
  if (exact) return exact;
  const compact = needle.replace(/\s+/g, "");
  const byCompact = threads.find(
    (t) => t.conversationId.replace(/\s+/g, "") === compact,
  );
  if (byCompact) return byCompact;

  const nNeedle = normalizeConversationKey(needle);
  return (
    threads.find((t) => normalizeConversationKey(t.conversationId) === nNeedle) ??
    null
  );
}

/**
 * Resolves the thread for the mailbox: conversation id first, then normalized subject.
 */
export function findThreadForMailbox(
  threads: EmailThread[],
  conversationId: string | null | undefined,
  itemSubject: string | null | undefined,
): EmailThread | null {
  const byConv = findThreadForConversation(threads, conversationId);
  if (byConv) return byConv;

  if (!itemSubject?.trim()) return null;
  const want = normalizeMailSubject(itemSubject);
  if (!want) return null;

  return (
    threads.find((t) => normalizeMailSubject(t.subject) === want) ?? null
  );
}
