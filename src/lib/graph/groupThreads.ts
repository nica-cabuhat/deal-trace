import type { EmailMessage, EmailThread } from "@/lib/types/thread";

/**
 * Groups a flat list of Graph API messages into EmailThread[] by conversationId.
 * Messages within each thread are kept in the order they were received.
 * The thread subject strips leading "Re: " from the first message.
 */
export function groupIntoThreads(messages: EmailMessage[]): EmailThread[] {
  const map = new Map<string, EmailThread>();

  for (const message of messages) {
    const existing = map.get(message.conversationId);
    if (existing) {
      existing.messages.push(message);
    } else {
      map.set(message.conversationId, {
        conversationId: message.conversationId,
        subject: message.subject.replace(/^Re:\s*/i, ""),
        messages: [message],
      });
    }
  }

  return Array.from(map.values());
}
